import path from "path";
import { QueryTypes } from "sequelize";
import config from "../config/index.js";
import { sequelize } from "../database/db.js";
import { Module } from "../types/module.js";
import { Logging } from "../utils/logging.js";
import { Subject } from "../database/models/subject.js";
import { getRandomInt } from "../utils/random-numbers.js";
import * as fs from "fs";
import { makeGzipped } from "../utils/store-file.js";
import { createRequire } from "module";
import { extractURLParams } from "../utils/network.js";
import { SignalingServer, SignalingServerEvents } from "playwright-mirror";
import { EventTraceReport, readActionTraces } from "../utils/trace-reader.js";

const require = createRequire(import.meta.url);
const crypto = require("crypto");

// Time after which the exploit generator is killed for a finding

class UserDiffManual extends Module {
    name: string = "userdiff_manual";
    reportId: number = -1;
    requests: any[] = [];
    frames: any[] = [];

    /**
     * Clean database tables (drop them)
     */
    clean = async () => {
        await sequelize.query("DROP TABLE userdiff_frame CASCADE");
    }

    public cleanForSubject = async (subject: Subject) => {
        await sequelize.sync();

        await sequelize.query("DELETE FROM userdiff_report WHERE subject_id = :subjectId", {
            replacements: {
                subjectId: subject.id
            }
        })

        await sequelize.query("DELETE FROM userdiff_mirror_event WHERE subject_id = :subjectId", {
            replacements: {
                subjectId: subject.id
            }
        });
    }

    /**
     * Create necessary database tables and setup indexes on certain fields for querying/analysis performance
     */
    public setup = async () => {
        if (config.mode === "connected") {

            await sequelize.sync();

            // check if the table exists

            await sequelize.query("CREATE TABLE IF NOT EXISTS userdiff_report (report_id SERIAL PRIMARY KEY, subject_id INTEGER REFERENCES subjects(id), task_id INTEGER REFERENCES visit_tasks(id), created_at TIMESTAMP, updated_at TIMESTAMP, session_id INTEGER REFERENCES sessions(id))")

            // Frame information
            await sequelize.query("CREATE TABLE IF NOT EXISTS userdiff_frame (frame_id SERIAL PRIMARY KEY, report_id INTEGER  DEFAULT NULL REFERENCES userdiff_report(report_id) ON DELETE CASCADE, frame_src TEXT, end_url TEXT, client_frame_id TEXT, title TEXT, is_main_frame BOOLEAN, created_at TIMESTAMP, updated_at TIMESTAMP, is_from_interaction BOOLEAN DEFAULT FALSE)")

            // Signaling server events
            await sequelize.query("CREATE TABLE IF NOT EXISTS userdiff_mirror_event (id SERIAL PRIMARY KEY, event_id INTEGER, type TEXT, event_data JSON, created_at TIMESTAMP, subject_id INTEGER REFERENCES subjects(id))")

            // Interactions 
            await sequelize.query("CREATE TABLE IF NOT EXISTS userdiff_interaction (interaction_id SERIAL PRIMARY KEY, interaction_type TEXT, created_at TIMESTAMP, frame_id INTEGER REFERENCES userdiff_frame(frame_id) ON DELETE CASCADE, report_id INTEGER REFERENCES userdiff_report(report_id) ON DELETE CASCADE, api_name TEXT DEFAULT NULL, params JSON DEFAULT NULL, duration FLOAT DEFAULT NULL)")

            // Page changes
            // await sequelize.query("CREATE TABLE userdiff_page_change (page_change_id SERIAL PRIMARY KEY, url TEXT, type TEXT, created_at TIMESTAMP, updated_at TIMESTAMP, report_id INTEGER REFERENCES userdiff_report(report_id) ON DELETE CASCADE)")

            // Requests
            await sequelize.query("CREATE TABLE IF NOT EXISTS userdiff_request (request_id SERIAL PRIMARY KEY, report_id INTEGER REFERENCES userdiff_report(report_id) ON DELETE CASCADE, client_frame_id TEXT, method TEXT, url TEXT, is_navigation_request BOOLEAN, resource_type TEXT, is_from_main_frame BOOLEAN, params JSON, body TEXT, created_at TIMESTAMP, updated_at TIMESTAMP)");
            await sequelize.query("CREATE INDEX IF NOT EXISTS userdiff_request_method ON userdiff_request(method)")

            await sequelize.query("CREATE INDEX IF NOT EXISTS userdiff_request_is_navigation_request ON userdiff_request(is_navigation_request)")

            await sequelize.query("CREATE TABLE IF NOT EXISTS userdiff_request_headers (header_id SERIAL PRIMARY KEY, request_id INTEGER REFERENCES userdiff_request(request_id) ON DELETE CASCADE, name TEXT, value TEXT, created_at TIMESTAMP, updated_at TIMESTAMP)")
            await sequelize.query("CREATE INDEX IF NOT EXISTS userdiff_request_headers_name ON userdiff_request_headers(name)")

            // Responses
            await sequelize.query("CREATE TABLE IF NOT EXISTS userdiff_response (response_id SERIAL PRIMARY KEY, report_id INTEGER REFERENCES userdiff_report(report_id) ON DELETE CASCADE, client_frame_id TEXT, request_id INTEGER REFERENCES userdiff_request(request_id) ON DELETE CASCADE, start_url TEXT, end_url TEXT, status_code INTEGER, status_line TEXT, sizes JSON, timing JSON, hash TEXT, resource_type TEXT, is_from_main_frame BOOLEAN, created_at TIMESTAMP, updated_at TIMESTAMP)");
            await sequelize.query("CREATE TABLE IF NOT EXISTS userdiff_response_headers (header_id SERIAL PRIMARY KEY, response_id INTEGER REFERENCES userdiff_response(response_id) ON DELETE CASCADE, name TEXT, value TEXT, created_at TIMESTAMP, updated_at TIMESTAMP)")
    
            await sequelize.query("CREATE TABLE IF NOT EXISTS userdiff_body (body_id SERIAL PRIMARY KEY, hash TEXT, body BYTEA, created_at TIMESTAMP, updated_at TIMESTAMP)")
    
            await sequelize.query("CREATE INDEX IF NOT EXISTS userdiff_response_headers_name ON userdiff_response_headers(name)")
        }
    }

    /**
     * Report a collected request to the database / log output otherwise
     * 
     * @param reportId Report to attach requests to
     * @param clientFrameId Client side frame id from playwright (guid)
     * @param method Method of request
     * @param url Url of request
     * @param isNavigationRequest Whether request was a navigation request
     * @param resourceType Type of requested resource
     * @param isFromMainFrame Flag, whether frame originated from main frame
     * @returns Id of request entry (random if not stored)
     */
    reportRequest = async (reportId: number, clientFrameId: string, method: string, url: string, isNavigationRequest: boolean, postData: string | null, resourceType: string, isFromMainFrame: boolean) => {
        if (config.mode === "connected") {
            // In connected mode, write to database
            let res = await sequelize.query('INSERT INTO userdiff_request (report_id, client_frame_id, method, url, is_navigation_request, resource_type, is_from_main_frame, params, body, created_at, updated_at) VALUES (:reportId, :clientFrameId, :method, :url, :isNavigationRequest, :resourceType, :isFromMainFrame, :params, :body, :createdAt, :updatedAt) RETURNING request_id', {
                replacements: {
                    reportId,
                    clientFrameId,
                    method,
                    url,
                    isNavigationRequest,
                    resourceType,
                    isFromMainFrame,
                    params: JSON.stringify(extractURLParams(url)),
                    body: postData,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                type: QueryTypes.INSERT
            });
            if (res.length) {
                return ((res[0] as any)[0] as any).request_id
            }
        } else {
            // Otherwise, generate stub id and output to console
            let request_id = getRandomInt(Number.MAX_SAFE_INTEGER)
            Logging.debug(`[userdiff] Request report id="${request_id}" clientFrameId="${clientFrameId}" url="${url}" method="${method}" isNavigationRequest="${isNavigationRequest ? "true" : "false"}"`)
            return request_id;
        }
    }

    /**
     * Store a header belonging to a request in database / log output otherwise
     * 
     * @param requestId Id header belongs to
     * @param name Name of the header
     * @param value Value of the header
     * @returns Id of header entry (random if not stored)
     */
    reportRequestHeader = async (requestId: number, name: string, value: string) => {
        if (config.mode === "connected") {
            // In connected mode, write to database
            let res = await sequelize.query('INSERT INTO userdiff_request_headers (request_id, name, value, created_at, updated_at) VALUES (:requestId, :name, :value, :createdAt, :updatedAt) RETURNING header_id', {
                replacements: {
                    requestId,
                    name,
                    value,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                type: QueryTypes.INSERT
            });
            if (res.length) {
                return ((res[0] as any)[0] as any).header_id
            }
        } else {
            // Otherwise, generate stub id and output to console
            Logging.debug(`[userdiff] Request header for request with id="${requestId}" report name="${name}" value="${value}"`)
            return getRandomInt(Number.MAX_SAFE_INTEGER);
        }
    }

    /**
     * Report a collected response and store in database / log to output
     * 
     * @param reportId Id of cxss report
     * @param clientFrameId Client side frame id (guid)
     * @param startUrl Start url of request that lead to response
     * @param endUrl Final url where response was gotten from
     * @param statusCode Status code of response
     * @param statusLine Status line of response
     * @param sizes Response sizes attributes (performance data)
     * @param timing Timing information about response/request
     * @param hash Hash of response content
     * @param resourceType Type of resource that was returned
     * @param isFromMainFrame Flag, whether response originated from main frame
     * @returns Id of stored response (random if not stored)
     */
    reportResponse = async (reportId: number, clientFrameId: string, requestId: number, startUrl: string, endUrl: string, statusCode: number, statusLine: string, sizes: any, timing: any, hash: string, resourceType: string, isFromMainFrame: boolean) => {
        if (config.mode === "connected") {
            // In connected mode, write to database
            let res = await sequelize.query('INSERT INTO userdiff_response (report_id, client_frame_id, request_id, start_url, end_url, status_code, status_line, sizes, timing, hash, resource_type, is_from_main_frame, created_at, updated_at) VALUES (:reportId, :clientFrameId, :requestId, :startUrl, :endUrl, :statusCode, :statusLine, :sizes, :timing, :hash, :resourceType, :isFromMainFrame, :createdAt, :updatedAt) RETURNING response_id', {
                replacements: {
                    reportId,
                    clientFrameId,
                    requestId,
                    startUrl,
                    endUrl,
                    statusCode,
                    statusLine,
                    sizes: JSON.stringify(sizes),
                    timing: JSON.stringify(timing),
                    hash,
                    resourceType,
                    isFromMainFrame,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                type: QueryTypes.INSERT
            });
            if (res.length) {
                return ((res[0] as any)[0] as any).response_id
            }
        } else {
            // Otherwise, generate stub id and output to console
            return getRandomInt(Number.MAX_SAFE_INTEGER);
        }
    }

    /**
     * Report header belonging to a collected response to database / log to output
     * 
     * @param responseId Id of response header belongs to
     * @param name Name of header
     * @param value Value of header
     * @returns Id of header entry (in database / random if not stored)
     */
    reportResponseHeader = async (responseId: number, name: string, value: string) => {
        if (config.mode === "connected") {
            // In connected mode, write to database
            let res = await sequelize.query('INSERT INTO userdiff_response_headers (response_id, name, value, created_at, updated_at) VALUES (:responseId, :name, :value, :createdAt, :updatedAt) RETURNING header_id', {
                replacements: {
                    responseId,
                    name,
                    value,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                type: QueryTypes.INSERT
            });
            if (res.length) {
                return ((res[0] as any)[0] as any).header_id
            }
        } else {
            // Otherwise, generate stub id and output to console
            Logging.debug(`[userdiff] request header for request with id="${responseId}" report name="${name}" value="${value}"`)
            return getRandomInt(Number.MAX_SAFE_INTEGER);
        }
    }

    reportBody = async (hash: string, body: Buffer) => {
        if (config.mode === "connected") {
            // In connected mode, write to database
            let res = await sequelize.query('INSERT INTO userdiff_body (hash, body, created_at, updated_at) VALUES (:hash, :body, :createdAt, :updatedAt) RETURNING body_id', {
                replacements: {
                    hash,
                    body,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                type: QueryTypes.INSERT
            });
            if (res.length) {
                return ((res[0] as any)[0] as any).body_id
            }
        }
        else {
            // Otherwise, generate stub id and output to console
            Logging.debug(`[userdiff] body report hash="${hash}"`)
            return getRandomInt(Number.MAX_SAFE_INTEGER);
        }
    }

    /**
     * 
     * @param reportId Id of report frame belongs to
     * @param frameSrc Source URL of frame
     * @param endUrl Final URL of frame
     * @param clientFrameId Client-side id of frame (guid from playwright)
     * @param title Title of frame
     * @param isMainFrame Flag, whether it is a main frame
     * @param transaction Transaction to append writes to
     * @returns 
     */
    reportFrame = async (reportId: number, frameSrc: string, endUrl: string, clientFrameId: string, title: string, isMainFrame: boolean, transaction: any) => {
        if (config.mode === "connected") {
            // In connected mode, write to database
            try {
                let res = await sequelize.query('INSERT INTO userdiff_frame (report_id, frame_src, end_url, client_frame_id, title, is_main_frame, created_at, updated_at) VALUES (:reportId, :frameSrc, :endUrl, :clientFrameId, :title, :isMainFrame, :createdAt, :updatedAt) RETURNING frame_id', {
                    replacements: {
                        reportId,
                        frameSrc,
                        endUrl,
                        clientFrameId,
                        title,
                        isMainFrame,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    },
                    transaction: transaction,
                    type: QueryTypes.INSERT
                });
                if (res.length) {
                    return ((res[0] as any)[0] as any).frame_id
                }
            } catch (err: any) {
                Logging.error(`Writing to database in (reportFrame) failed. Error: ${err.toString()}`);
            }
        } else {
            // Otherwise, generate stub id and output to console
            Logging.debug(`[userdiff] frame report frameSrc="${frameSrc}" endUrl="${endUrl}" clientFrameId="${clientFrameId}" title="${title}"`)
            return getRandomInt(Number.MAX_SAFE_INTEGER);
        }
    }

    reportMirrorEvent = async (type: string, eventId: number, createdAt: string, eventData: any, subjectId: number) => {
        if (config.mode === "connected") {
            // In connected mode, write to database

            try {
                let res = await sequelize.query('INSERT INTO userdiff_mirror_event (event_id, type, event_data, created_at, subject_id) VALUES (:eventId, :type, :eventData, :createdAt, :subjectId) RETURNING event_id', {
                    replacements: {
                        eventId,
                        type,
                        eventData: JSON.stringify(eventData),
                        createdAt,
                        subjectId
                    },
                    type: QueryTypes.INSERT
                });
                if (res.length) {
                    return ((res[0] as any)[0] as any).event_id
                }
            } catch (err: any) {
                Logging.error(`Writing to database in (reportMirrorEvent) failed. Error: ${err.toString()}`);
            }
        }
        else {
            // Otherwise, generate stub id and output to console
            Logging.debug(`[userdiff] mirror event type="${type}" eventId="${eventId}"`)
            return getRandomInt(Number.MAX_SAFE_INTEGER);
        }
    }


    reportInteraction = async (eventTraceReport: EventTraceReport) => {

        if (config.mode === "connected") {
            // In connected mode, write to database
            let transaction = await sequelize.transaction();

            try {
                let res;

                // first find or create the frame
                let frameId = await sequelize.query('SELECT frame_id FROM userdiff_frame WHERE client_frame_id = :clientFrameId', {
                    replacements: {
                        clientFrameId: eventTraceReport.frameId
                    },
                    type: QueryTypes.SELECT
                })

                if (frameId.length) {
                    frameId = (frameId[0] as any).frame_id
                } else{
                    if (eventTraceReport.frameId)
                        frameId = await this.reportFrame(this.reportId, eventTraceReport.frameUrl, eventTraceReport.frameUrl, eventTraceReport.frameId, "", eventTraceReport.isMainFrame, transaction)
                    else
                        frameId = null;
                }

                if (eventTraceReport.type == "action") {
                    res = await sequelize.query('INSERT INTO userdiff_interaction (interaction_type, frame_id, api_name, params, duration, created_at) VALUES (:interactionType, :frameId, :apiName, :params, :duration, :createdAt) RETURNING interaction_id', {
                        replacements: {
                            interactionType: eventTraceReport.type,
                            frameId: frameId,
                            apiName: eventTraceReport.apiName,
                            params: JSON.stringify(eventTraceReport.params),
                            duration: eventTraceReport.after.endTime - eventTraceReport.before.startTime,
                            createdAt: new Date(eventTraceReport.wallTime)
                        },
                        type: QueryTypes.INSERT,
                        transaction: transaction
                    })
                }
                else if (eventTraceReport.type == "input") {
                    res = await sequelize.query('INSERT INTO userdiff_interaction (interaction_type, frame_id, created_at) VALUES (:interactionType, :frameId, :createdAt) RETURNING interaction_id', {
                        replacements: {
                            interactionType: eventTraceReport.type,
                            frameId: frameId,
                            createdAt: new Date(eventTraceReport.wallTime)
                        },
                        type: QueryTypes.INSERT,
                        transaction: transaction
                    })
                }

                await transaction.commit();

                if (res.length) {
                    return ((res[0] as any)[0] as any).interaction_id
                }
            } catch (err: any) {
                transaction.rollback();
                Logging.error(`Writing to database in (reportInteraction) failed. Error: ${err.toString()}`);
            }

        }
        else {
            // Otherwise, generate stub id and output to console
            Logging.debug(`[userdiff] interaction event="${eventTraceReport}" frameId="${eventTraceReport.frameId}" `)
            return getRandomInt(Number.MAX_SAFE_INTEGER);
        }

    }


    /**
     * Creates empty report object all other db entries are attached to 
     * 
     * @param subjectId Id of subject reports to
     * @param sessionId Id of session if crawl happened with session
     * @returns Id of report
     */
    createReport = async (subjectId: any, taskId: any, sessionId: number) => {
        if (config.mode === "connected") {
            // In connected mode, write to database
            try {

                let res = await sequelize.query('INSERT INTO userdiff_report (subject_id, task_id, session_id, created_at, updated_at) VALUES (:subjectId, :taskId, :sessionId, :createdAt, :updatedAt) RETURNING report_id', {
                    replacements: {
                        subjectId: subjectId,
                        taskId: taskId, 
                        sessionId: sessionId,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    },
                    type: QueryTypes.INSERT
                })
                if (res.length) {
                    return ((res[0] as any)[0] as any).report_id
                }

            } catch (err: any) {
                Logging.error(`Writing to database in (createReport) failed. Error: ${err.toString()}`);
            }
        } else {
            // Otherwise, generate stub id and output to console
            return getRandomInt(Number.MAX_SAFE_INTEGER)
        }
    }

    eventsFrom(signalingServer: SignalingServer) {

        const instrumented_events = [
            SignalingServerEvents.FOLLOWER_CONNECTED,
            SignalingServerEvents.FOLLOWER_DISCONNECTED,
            SignalingServerEvents.LEADER_DISCONNECTED,
            SignalingServerEvents.LEADER_CONNECTED,
            SignalingServerEvents.LEADER_ACTION,
        ]

        const globalThis = this;

        if (!globalThis.task?.id) throw new Error("Task id is not defined");

        for (const event of instrumented_events) {
            signalingServer.on(event, (data) => {
                if (!globalThis.task?.id) throw new Error("Task id is not defined");
                this.reportMirrorEvent(event, data.id, data.created_at, data.data, globalThis.task?.id)
            })
        }

    }

    /**
     * Add necessary hooks for userdiff collection from current task
     * 
     * @param page Page object from playwright which will be visited
     */
    before = async (page: any) => {

        const session = this.task?.session;

        if (!this.task || !session) {
            throw new Error("Task or session is not defined");
        }

        // verify that the session is in the session group for the task
        if (!session) {
            Logging.error(`[userdiff] Session not found for task id=${this.task.id}`)
            return;
        }

        // Create empty report for current task
        this.reportId = await this.createReport(this.task.subject.id, this.task.id, session.id);

        // Empty result object for task
        this.task!.result = {
            subjectId: "",
            frames: this.frames,
            url: this.task.subject.url,
            html: "",
        }
        // Leave empty for main frame.
        this.frames[0] = {}


        // Listen to frame navigations and update end url of frames accordingly
        page.on('framenavigated', async (framedata: any) => {
            // Update frame navigation data
            var id = framedata._guid;
            for (let index = 0; index < this.frames.length; index++) {
                let element = this.frames[index];
                if (element.frameId === id) {
                    element.endUrl = framedata.url();
                }
            }
        });

        // Listen to frame attach events and collect frame information on attach
        page.on('frameattached', async (framedata: any) => {
            let title: string = "";
            try {
                title = await framedata.title();
            } catch (err: any) {
                title = "";
            }
            var frame: any = {
                frameSrc: framedata.url(),
                endUrl: framedata.url(),
                frameId: framedata._guid,
                parentFrameId: framedata.parentFrame() ? framedata.parentFrame()._guid : "",
                title: title,
                requests: [],
                findings: [],
                main: false,
                storage: []
            }
            this.frames.push(frame);

            // check if the frame exists in the database
            let frameId = await sequelize.query('SELECT frame_id FROM userdiff_frame WHERE client_frame_id = :clientFrameId', {
                replacements: {
                    clientFrameId: framedata._guid
                },
                type: QueryTypes.SELECT
            })

            if (!frameId.length) {
                await this.reportFrame(this.reportId, frame.frameSrc, frame.endUrl, frame.frameId, frame.title, frame.main, null)
            }
        });

        // Console error on failed request
        page.on('requestfailed', (request: any) => {
            Logging.debug(`[userdiff] Request to ${request.url()} has failed. Got requestfailed event.`)
        });

        let mainFrame = page.mainFrame()

        // Listen to requests
        const storeRequest = async (requestdata: any) => {
            let resourceType = await requestdata.resourceType();

            // Report request to database with client side frame id (guid)
            try {
                let frame = requestdata.frame();

                let requestId = await this.reportRequest(
                    this.reportId,
                    frame._guid,
                    requestdata.method(),
                    requestdata.url(),
                    requestdata.isNavigationRequest(),
                    requestdata.postData(),
                    resourceType,
                    frame === mainFrame
                )

                // For all headers of request, log each to database as well
                let requestHeaders = await requestdata.headersArray();
                for (let index = 0; index < requestHeaders.length; index++) {
                    const element = requestHeaders[index];

                    await this.reportRequestHeader(
                        requestId,
                        element.name,
                        element.value
                    )
                }

                return requestId;

            } catch (err: any) {
                Logging.error(`[userdiff] Error occured during request collection of url ${requestdata.url()} of report id="${this.reportId}". Error: ${err.toString()}`)
                return null;
            }

        }

        // Listen to all responses
        page.on('response', async (responsedata: any) => {
            let resourceType = await responsedata.request().resourceType();

            let requestId = await storeRequest(responsedata.request());

            // Report response to database with client side frame id (guid)
            try {

                if (!requestId) {
                    return;
                }

                let frame = responsedata.frame();
                let status_code = await responsedata.status();

                // Attempt to collect response body if if was not a 3xx response code
                let body;
                try {
                    if (status_code >= 300 && status_code <= 399) {
                        Logging.debug(`[userdiff] Ignoring request body from response that was from redirect (empty) of frame id="${frame._guid}" and url="${responsedata.url()}"`)
                        body = "";
                    } else {
                        body = await responsedata.body();
                    }
                } catch (err: any) {
                    body = "";
                }

                let responseBodyHash;
                if (body == "") {
                    responseBodyHash = "";
                } else {



                    // Hash the request body
                    responseBodyHash = crypto.createHash('md5').update(body).digest('hex');
                }

                let responseId = await this.reportResponse(
                    this.reportId,
                    frame._guid,
                    requestId,
                    responsedata.request().url(),
                    responsedata.url(),
                    responsedata.status(),
                    responsedata.statusText(),
                    await responsedata.request().sizes(),
                    responsedata.request().timing(),
                    responseBodyHash,
                    resourceType,
                    frame === mainFrame
                )

                // Collect all headers belonging to response in database
                let responseHeaders = await responsedata.headersArray();
                for (let index = 0; index < responseHeaders.length; index++) {
                    const element = responseHeaders[index];

                    await this.reportResponseHeader(
                        responseId,
                        element.name,
                        element.value
                    )
                }

                // If crawling with database connection, also store gzipped response body content
                if (config.mode === "connected" && body != "") {
                    const gzippedBuffer = await makeGzipped(body);
                    const bodyId = await this.reportBody(responseBodyHash, gzippedBuffer);
                }
            } catch (err: any) {
                Logging.error(`[userdiff] Error occured during response collection of url ${responsedata.url()} of report id="${this.reportId}". Error: ${err.toString()}`)
                Logging.error(err.stack);
            }
        })

        // Check if VERIFICATION task (exploit verification)

    };

    /**
     * Runs after page was visited and loading timed out
     * @param page Page to run execute on
     */
    execute = async (page: any) => {

    };


    processBrowserTrace = async () => {

        const trace_fp = path.join(config.dataPath, "traces", `${this.task?.id}/follower-trace.zip`);

        // wait until the trace file is written but for a maximum of 1 minute

        try {
            let timeout = 0;
            while (!fs.existsSync(trace_fp) && timeout < 2) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                timeout++;
            }

            if (!fs.existsSync(trace_fp)) {
                console.log(`Trace file ${trace_fp} not found after 60 seconds. Exiting...`)
            }

            const { events, tracesText } = await readActionTraces(trace_fp);

            for (const event of events) {
                await this.reportInteraction(event);
            }

            // save the traceText back in the directory and remove the zip file
            fs.writeFileSync(trace_fp.replace(".zip", ".trace"), tracesText);

            // delete the zip file
            fs.unlinkSync(trace_fp);
        } catch (err: any) {
            console.log(err);
            console.log(err.stack);
        }

    }

    /**
     * After finishing page, run finish method to report when cxss_report was finished (updatedAt date) or 
     * exploit verification results
     * @param page Page to run finish in
     */
    finish = async (page: any) => {
        await this.processBrowserTrace();
        await this.reportTaskFinish(this.task?.id);
    };

    /**
     * Report that recon of subject was finished
     * @param subjectId Current subject
     */
    async reportTaskFinish(subjectId?: number) {
        if (config.mode === "connected") {
            // Write to database the update query
            Logging.debug(`[userdiff] Finishing report for subject id="${subjectId}". Updating row updated_at value`)
            await sequelize.query('UPDATE userdiff_report SET updated_at = :updatedAt WHERE report_id = :reportId', {
                replacements: {
                    reportId: this.reportId,
                    updatedAt: new Date()
                },
                type: QueryTypes.UPDATE
            })
        } else {
            // If not connected to database, only write to log
            Logging.debug(`[userdiff] Finished report ${this.reportId} for subject ${subjectId}.`)
        }
    }

}

export default UserDiffManual;