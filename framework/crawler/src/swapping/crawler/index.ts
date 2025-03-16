import config, { Config } from "../../config/index.js";
import * as fs from "fs";
import path from "path";
import { Module } from "../../types/module.js";
import { Logging } from "../../utils/logging.js";
import { Browser, BrowserContext, LaunchOptions, Page, chromium, devices, firefox } from "playwright";
import { Task, TaskQueue } from "./taskqueue.js";
import DatabaseHelper from "../../utils/database-helper.js";
import { SwapCandidate, SwapTask } from "../../database/models/tasks.js";
import { FORBIDDEN_HEADERS, IdType, RequestInstance, SwapRequest } from "../swap_request.js";
import SwapModule from "../../modules/swap.js";
import crypto from "crypto";
import HttpBrowser from "./http_browser.js";

// dir path of this file
const __dirname = path.dirname(new URL(import.meta.url).pathname);

type ImportModuleType = { default: Module };

export type ResponseInstance = {
    status: number;
    statusText: string;
    body: string;
    startUrl: string;
    endUrl: string;
    sizes: string;
    hash: string;
    timings: string;
    headers: Record<string, string>;
}

class Crawler {
    id?: number;

    numberOfFinishedSubjects: number = 0;

    browser?: Browser;
    page?: Page;
    config?: Config;
    context?: BrowserContext;
    modules: Module[] = [];

    queue = new TaskQueue();

    async setup(moduleName?: string) {
        this.modules = [];
        // Setup database structure
        await DatabaseHelper.setup();

        if (moduleName) {
            // Setup modules
            const files = fs.readdirSync(path.join(__dirname, "..", "..", "modules"));
            const imports = await Promise.all(files.map(file => (
                import(path.resolve(__dirname, '..', '..', 'modules', file)).then((module: ImportModuleType) => module.default)))
            )

            for (let index = 0; index < imports.length; index++) {
                const module = imports[index];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const instantiatedModule = new (module as any)();
                if (instantiatedModule.name === moduleName) {
                    this.modules.push(instantiatedModule)
                }
            }

            for (let index = 0; index < this.modules.length; index++) {
                const module = this.modules[index];
                await module.setup();
            }
        } else {
            Logging.warn(`Started crawling setup with no module selected to setup for`)
        }
    }

    async init(config: Config) {
        this.config = config;

        if (config.mode === "connected") {
            // await this.backend.register();
            this.id = await DatabaseHelper.registerCrawler();
            this.queue.workerId = this.id;
        }
    }

    static pollingCounter = 1;

    /**
     * Perform the passed task by visiting the attached URL and executing the configured module code on the site. Additionally,
     * runs code before for loading the site to attach handlers to the page and afterwards after having loaded the site.
     * @param work 
     */
    async visit(work: Task) {
        // If no ID is attached to the crawler, do nothing and terminate
        if (!this.id) {
            Logging.error(`Crawler not initialized when trying to visit a page. Exiting...`)
            process.exit(-1);
        }
        const task: Task = work;
        // Set visitation begin time to task
        await SwapTask.update({
            visitation_begin: new Date()
        }, {
            where: {
                id: task.id
            }
        })

        // get all candidates
        const swapCandidates = await SwapCandidate.findAll({
            where: {
                task_id: task.id,
                state: "free"
            },
            include: [SwapTask]
        })

        Logging.info(`Visting ${task.subject.url} for task (id="${task.id}") ${task.session ? "with Context" : ""}.`)

        // if the task is live we will use the backend request module


        if (task.is_live) {

            this.browser = (new HttpBrowser() as unknown as Browser);
        }
        else {
            if (config.dynamic.user_data_dir) {
                throw new Error("Starting up chrome with persistent context not implemented yet.")
            } else {
                // Start chromium instance and pass user agent
                this.browser = await chromium.launch({
                    headless: !config.headfull,
                    viewport: { width: devices["Desktop Chrome"].viewport.width, height: devices["Desktop Chrome"].viewport.height },
                    userAgent: (config.dynamic.user_agent ? config.dynamic.user_agent : devices["Desktop Chrome"].userAgent) + config.academicMarker,
                    bypassCSP: true,
                    args: [
                        "--disable-web-security",
                        "--disable-features=IsolateOrigins,site-per-process",
                        "--no-sandbox",
                    ]
                } as LaunchOptions)
            }
        }



        Logging.info(`Started up ${this.browser?.browserType().name()} with version ${this.browser?.version()}`)

        // If browser was not initialized and therefore is undefined, exit crawler due to error
        if (!this.browser) {
            Logging.error(`Failure happened during initialization of browser. Exiting...`)
            process.exit(-1);
        }

        // If no user data directory was specified, start a browser context after launching the browser
        if (!config.dynamic.user_data_dir) {
            this.context = await this.browser.newContext({
                ...(config.dynamic.user_agent && {
                    userAgent: config.dynamic.user_agent
                }),
            })
        }

        // If crawling on the same site during same task, wait for sameSite interval on pages beyond the root
        // if (subject.taskData.depth && subject.taskData.depth > 0) {
        //     await sleep(config.timeouts.sameSite);
        // }

        try {
            const element: Task = {
                ...task as any as Task,
            };

            // Check if task to be started is associated with session
            if (element.session) {
                // If a session is configured, check if temporary datapath for storing sessions is existing
                const sessionPath = path.join(config.dataPath, "swap_sessions")
                if (!fs.existsSync(sessionPath)) {
                    // If it does not exist, create the folder
                    fs.mkdirSync(sessionPath, { recursive: true })
                }

                // Check if for crawler there is already a session json stored on disk
                const filePath = path.join(sessionPath, `state-${this.id}.json`);
                if (fs.existsSync(filePath)) {
                    // If so, delete that session file
                    fs.rmSync(filePath);
                }
                // Write new session file containing session information for task on disk
                fs.writeFileSync(filePath, JSON.stringify(element.session.session_data, null, 2), { encoding: "utf-8" })

                // Check which browser is configured, and start new browser context loading the session data file from disk
                if (config.dynamic.chromium) {
                    this.context = await this.browser.newContext({
                        storageState: filePath,
                        ...(config.dynamic.user_agent && {
                            userAgent: config.dynamic.user_agent
                        }),
                    })
                } else {
                    this.context = await this.browser.newContext({
                        storageState: filePath,
                        ...(config.dynamic.user_agent && {
                            userAgent: config.dynamic.user_agent
                        }),
                    })
                }
                // Open a new page in the browser
                this.page = await this.context?.newPage();
            } else {
                // If no session is configured, only open a new page in the browser
                this.page = await this.context?.newPage();
            }

            // Check if opening the page has failed and if so, terminate the crawler
            if (!this.page) {
                Logging.error(`Error happened during page initialization. Exiting...`)
                process.exit(-1);
            }

            this.modules = [];

            // Load all modules from modules folder into the crawler and store in modules array
            Logging.debug("Fetching specified module")
            const files = fs.readdirSync(path.join(__dirname, "..", "..", "modules"));
            const imports = await Promise.all(files.map(file => (
                import(path.resolve(__dirname, '..', '..', 'modules', file)).then((module: ImportModuleType) => module.default)))
            )
            for (let index = 0; index < imports.length; index++) {
                const module = imports[index];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const instantiatedModule = new (module as any)();
                if (instantiatedModule.name === config.dynamic.module) {
                    this.modules.push(instantiatedModule)
                }
            }

            // For all loaded modules, run register method prior to performing the task and assign the crawler to the module
            Logging.debug("Registering task in module")
            for (let index = 0; index < this.modules.length; index++) {
                const module = this.modules[index];
                await module.register(element);
            }

            // For all loaded modules, run before method prior to performing the task
            Logging.debug("Executing before() method of module")
            for (let index = 0; index < this.modules.length; index++) {
                const module = this.modules[index];
                await module.before(this.page);
            }

            // Open the URL belonging to the task in the page
            Logging.debug("Opening URL that was specified via page.goto")
            await this.page.goto(element.subject.url, {
                timeout: config.goto.timeout,
                waitUntil: config.goto.waitUntil
            });

            // wait for 10 seconds
            await this.page.waitForTimeout(5000);


            for (let candidate of swapCandidates) {

                const method: string = candidate.swap_request_representation.template.method;
                const refAccountId: IdType = task.session?.session_information?.account?.id;
                const swapAccountId: IdType = candidate.swap_request_representation.instances.filter((instance: any) => instance != refAccountId)[0];


                if (method.toLowerCase() === "get" && !task.is_live) {
                    // trigger a reference request with original values
                    let res = await this._processSwapCandidate(candidate, refAccountId, null, false);
                    if (!res?.success) continue;

                    await this.page.waitForTimeout(1000);
                }

                // trigger a swap request
                await this._processSwapCandidate(candidate, swapAccountId, refAccountId, task.is_live);

                await this.page.waitForTimeout(2000);
            }

            // Letting the module execute the code that was registered in before
            Logging.debug("Waiting for page to finish executing")
            await this.page.waitForTimeout(config.timeouts.moduleExec)

            // Run through all modules and perform the execute method after the pages execution was waited for
            Logging.debug("Finalizing module execution by calling execute() of module")
            for (let index = 0; index < this.modules.length; index++) {
                const module = this.modules[index];
                await module.execute(this.page);
            }


            // Afterwards, execute finish method on all loaded modules
            Logging.debug("Executing the finish() method of the registered module.")
            for (let index = 0; index < this.modules.length; index++) {
                const module = this.modules[index];
                await module.finish(this.page);
            }

            Logging.info(`Finished visiting ${task.subject.url} for task (id="${task.id}").`)
        } catch (err: unknown) {
            // If any error happened during execution, check if crawler was connected to the database
            if (config.mode === "connected") {
                // Store a message that the subject was skipped in the database
                Logging.info(`Skipping subject due to error. Error: ${(err as Error).toString()}`)
                Logging.info((err as Error).stack || "")
                // await DatabaseHelper.skipSubject(subject.id, subject.url_id as number, (err as Error).toString())
                await DatabaseHelper.finishTask(task.id, true)

                // Close the open page
                Logging.info("Closing down page...")
                await this.page?.close()
                // Close the opened context
                Logging.info("Closing down context...")
                await this.context?.close()
                // Close the running browser
                Logging.info("Closing down browser...")
                await this.browser.close()


                this.numberOfFinishedSubjects++;
                return;
            }
        }

        // After crawler finished work successfully, close down page/context/browser
        Logging.debug("Closing down page...")
        await this.page?.close()
        Logging.debug("Closing down context...")
        await this.context?.close()
        Logging.debug("Closing down browser...")
        await this.browser.close()

        // Check if browser was connected to the database
        if (config.mode === "connected") {
            // Store finished message to subject in the database
            Logging.debug("Marking subject as done via DatabaseHelper.")
            await DatabaseHelper.finishTask(task.id);
        }

        this.numberOfFinishedSubjects++;
        // taskBenchmark.stop();
    }


    /**
     * Helper method for closing the open context/browser after crawl and deregistering the crawler from the database
     */
    async finish() {
        if (config.dynamic.user_data_dir) {
            this.context?.close();
        }
        if (this.browser) {
            this.browser.close();
        }
        if (config.mode === "connected") {
            await DatabaseHelper.deregisterCrawler({
                workerId: this.id!,
                numberOfFinishedSubjects: this.numberOfFinishedSubjects,
                message: "Normal worker termination"
            })
            process.exit(0)
        }
    }

    async _sendFetchRequest(request: RequestInstance, isLive: boolean): Promise<ResponseInstance> {

        const requestDict = request.toDict();

        function _addAcademicMarkerToUserAgent(headers: any) {


            if (headers["User-Agent"]) {
                headers["User-Agent"] = headers["User-Agent"] + config.academicMarker
            }
            else if (headers["user-agent"]) {
                headers["user-agent"] = headers["user-agent"] + config.academicMarker
            }
            else {
                headers["User-Agent"] = "AcademicCrawler"
            }
            return headers;
        }

        Logging.info(`Sending fetch request: ${JSON.stringify(requestDict)}`)

        let response: any = null;

        if (isLive) {

            // using the HTTPBrowser funcitonality

            let _response = await (this.page as any).fetch(requestDict.url, {
                method: requestDict.method,
                headers: _addAcademicMarkerToUserAgent(requestDict.headers),
                ... (requestDict.method !== "GET" ? { body: requestDict.body } : {})
            }
            )

            response = {
                status: _response.status,
                statusText: _response.statusText,
                body: _response.body,
                startUrl: requestDict.url,
                endUrl: _response.url,
                sizes: _response.headers["content-length"] || "",
                timings: JSON.stringify(_response.headers["timing-allow-origin"]),
                headers: _response.headers
            }

        } else {

            requestDict.headers = Object.fromEntries(
                Object.entries(
                    requestDict.headers as { [key: string]: string }).filter(([key, _]) => !FORBIDDEN_HEADERS.some(forbidden => key.toLowerCase().startsWith(forbidden.toLowerCase()))
                    ));

            response = await this.page?.evaluate(async (requestDict) => {

                const response = await fetch(requestDict.url, {
                    method: requestDict.method,
                    headers: requestDict.headers,
                    ... (requestDict.method !== "GET" ? { body: requestDict.body } : {})
                })

                const body = await response.text();
                return {
                    status: response.status,
                    statusText: response.statusText,
                    body: body,
                    startUrl: requestDict.url,
                    endUrl: response.url,
                    sizes: response.headers.get("content-length") || "",
                    timings: JSON.stringify(response.headers.get("timing-allow-origin")),
                    headers: Object.fromEntries(response.headers.entries())
                }

            }, requestDict);
        }

        if (!response) {
            throw new Error("Response was not received from page.evaluate")
        }

        const output: ResponseInstance = {
            ...response,
            hash: crypto.createHash("sha256").update(response.body).digest("hex") as string
        }

        return output;
    }

    async _processSwapCandidate(candidate: SwapCandidate, swapAccountId: IdType, refAccountId: IdType | null = null, isLive: boolean = false): Promise<{ success: boolean }> {

        const swapModule = this.modules[0] as SwapModule;

        await candidate.update({
            state: "processing"
        })

        Logging.info(`Processing swap candidate with id="${candidate.id}, swapAccountId="${swapAccountId}" and refAccountId="${refAccountId}"`)

        try {

            // generate request from template
            const template = SwapRequest.fromDict(candidate.swap_request_representation);
            const swappingVariables: any = refAccountId ? (candidate.interest_variables ? candidate.interest_variables : undefined) : undefined;

            const request = template.evaluate(
                swapAccountId,
                refAccountId,
                swappingVariables,
                swapModule.paramTracker
            );

            Logging.info(`${Object.keys(request.headers)}`)
            const response = await this._sendFetchRequest(request, isLive);

            // store response in database
            const reqId = await swapModule.reportRequest(request, candidate.id, refAccountId ? "swap" : "ref");
            await swapModule.reportResponse(reqId, response);

            // finish candidate
            await candidate.update({
                state: "finished"
            })

            return { success: true };

        } catch (e: any) {
            Logging.error(`Error during processing swap candidate: ${e.toString()}`)
            Logging.error(e.stack || "")
            candidate.update({
                state: "error",
                error: e.toString(),
                error_stack: e.stack || ""
            })

            return { success: false };
        }
    }

}

export default Crawler;