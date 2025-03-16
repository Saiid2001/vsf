import { QueryTypes } from "sequelize";
import config from "../config/index.js";
import { sequelize } from "../database/db.js";
import { RequestInstance } from "../swapping/swap_request.js";
import { Module } from "../types/module.js";
import { Logging } from "../utils/logging.js";
import { getRandomInt } from "../utils/random-numbers.js";
import { ResponseInstance } from "../swapping/crawler/index.js";
import { makeGzipped } from "../utils/store-file.js";
import { ParamTracker } from "../swapping/param_dictionary.js";

class SwapModule extends Module {
    name = "swap"
    paramTracker: ParamTracker

    constructor() {
        super()
        this.paramTracker = new ParamTracker()
    }

    public setup = async () => {
        if (config.mode === "connected") {

            await sequelize.sync();

            // Requests
            await sequelize.query("CREATE TABLE IF NOT EXISTS swap_request (request_id SERIAL PRIMARY KEY, candidate_id INTEGER REFERENCES swap_candidate_pairs(id), method TEXT, url TEXT, params JSON, body TEXT, created_at TIMESTAMP, updated_at TIMESTAMP, tag TEXT DEFAULT NULL)");

            await sequelize.query("CREATE TABLE IF NOT EXISTS swap_request_headers (header_id SERIAL PRIMARY KEY, request_id INTEGER REFERENCES swap_request(request_id) ON DELETE CASCADE, name TEXT, value TEXT, created_at TIMESTAMP, updated_at TIMESTAMP)")
            await sequelize.query("CREATE INDEX IF NOT EXISTS swap_request_headers_name ON swap_request_headers(name)")

            // Responses
            await sequelize.query("CREATE TABLE IF NOT EXISTS swap_response (response_id SERIAL PRIMARY KEY, request_id INTEGER REFERENCES swap_request(request_id) ON DELETE CASCADE, start_url TEXT, end_url TEXT, status_code INTEGER, status_line TEXT, sizes JSON, hash TEXT, created_at TIMESTAMP, updated_at TIMESTAMP)");
            await sequelize.query("CREATE TABLE IF NOT EXISTS swap_response_headers (header_id SERIAL PRIMARY KEY, response_id INTEGER REFERENCES swap_response(response_id) ON DELETE CASCADE, name TEXT, value TEXT, created_at TIMESTAMP, updated_at TIMESTAMP)")
            await sequelize.query("CREATE TABLE IF NOT EXISTS swap_resp_body (body_id SERIAL PRIMARY KEY, hash TEXT, body BYTEA, created_at TIMESTAMP, updated_at TIMESTAMP)")
        }
    }

    /**
     * Report a collected request to the database / log output otherwise
     * 
        * @param request Request instance to report
        * @param tag Tag to associate with request
        * @returns Id of stored request (random if not stored)
     */
    reportRequest = async (request: RequestInstance, swapCandidateId: number, tag: string) => {

        if (config.mode === "connected") {

            let res = await sequelize.query('INSERT INTO swap_request (method, url, params, body, created_at, updated_at, candidate_id, tag) VALUES (:method, :url, :params, :body, :createdAt, :updatedAt, :candidate_id, :tag) RETURNING request_id', {
                replacements: {
                    method: request.method,
                    url: request.url,
                    params: JSON.stringify(request.query),
                    body: request.body,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    candidate_id: swapCandidateId,
                    tag
                },
                type: QueryTypes.INSERT
            });

            // add the headers
            for (let header of Object.keys(request.headers)) {
                await this.reportRequestHeader(((res[0] as any)[0] as any).request_id, header, request.headers[header]);
            }

            if (res.length) {
                return ((res[0] as any)[0] as any).request_id
            }

        }
        else {
            // Otherwise, generate stub id and output to console
            Logging.debug(`[swap] Request report method="${request.method}" url="${request.url}"`)
            return getRandomInt(Number.MAX_SAFE_INTEGER);
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
            let res = await sequelize.query('INSERT INTO swap_request_headers (request_id, name, value, created_at, updated_at) VALUES (:requestId, :name, :value, :createdAt, :updatedAt) RETURNING header_id', {
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
            Logging.debug(`[swap] Request header for request with id="${requestId}" report name="${name}" value="${value}"`)
            return getRandomInt(Number.MAX_SAFE_INTEGER);
        }
    }

    /**
     * Report a collected response and store in database / log to output
     * 
     * @param requestId Id of request response belongs to
     * @param response Response instance to report
     * @returns Id of stored response (random if not stored)
     */
    reportResponse = async (requestId: number, response: ResponseInstance) => {
        if (config.mode === "connected") {
            // In connected mode, write to database
            let res = await sequelize.query('INSERT INTO swap_response (request_id, start_url, end_url, status_code, status_line, sizes, hash, created_at, updated_at) VALUES (:requestId, :startUrl, :endUrl, :statusCode, :statusLine, :sizes, :hash, :createdAt, :updatedAt) RETURNING response_id', {
                replacements: {
                    requestId,
                    startUrl: response.startUrl,
                    endUrl: response.endUrl,
                    statusCode: response.status,
                    statusLine: response.statusText,
                    sizes: JSON.stringify(response.sizes),
                    hash: response.hash,
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                type: QueryTypes.INSERT
            });

            // add the headers
            for (let header of Object.keys(response.headers)) {
                await this.reportResponseHeader(((res[0] as any)[0] as any).response_id, header, response.headers[header]);
            }

            // add the body
            const gzippedBuffer = await makeGzipped(response.body);
            await this.reportBody(response.hash, gzippedBuffer);

            if (res.length) {
                return ((res[0] as any)[0] as any).response_id
            }

        }
        else {
            // Otherwise, generate stub id and output to console
            Logging.debug(`[swap] Response report for request with id="${requestId}"`)
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
    reportResponseHeader = async (responseId: number, name: string, value: any) => {
        if (config.mode === "connected") {
            // In connected mode, write to database
            let res = await sequelize.query('INSERT INTO swap_response_headers (response_id, name, value, created_at, updated_at) VALUES (:responseId, :name, :value, :createdAt, :updatedAt) RETURNING header_id', {
                replacements: {
                    responseId,
                    name,
                    value: value instanceof Object ? JSON.stringify(value) : value,
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
            Logging.debug(`[swap] request header for request with id="${responseId}" report name="${name}" value="${value}"`)
            return getRandomInt(Number.MAX_SAFE_INTEGER);
        }
    }

    reportBody = async (hash: string, body: Buffer) => {
        if (config.mode === "connected") {
            // In connected mode, write to database
            let res = await sequelize.query('INSERT INTO swap_resp_body (hash, body, created_at, updated_at) VALUES (:hash, :body, :createdAt, :updatedAt) RETURNING body_id', {
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
            Logging.debug(`[swap] body report hash="${hash}"`)
            return getRandomInt(Number.MAX_SAFE_INTEGER);
        }
    }

    before = async (page: any) => {

        const handleRequest = async (request: any) => {
            try{
            await this.paramTracker.trackFromRequest(request)
            }
            catch(e: any){
                console.log(e)
            }
        }

        const handleResponse = async (response: any) => {
            try{
            await this.paramTracker.trackFromResponse(response)
            }
            catch(e: any){
                console.log(e)
            }
        }

        page.on('response', async (repsonsedata: any) => {
            await handleResponse(repsonsedata)

            const request = repsonsedata.request()
            await handleRequest(request)
        });

    };

}

export default SwapModule;