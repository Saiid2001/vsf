import { sequelize } from "../database/db.js";
import { Logging } from "./logging.js";
import { Subject } from "../database/models/subject.js";
import { SwapTask, DefaultTaskStatus, DefaultSwapTaskStatus, SwapCandidate, AnalysisTask } from "../database/models/tasks.js";
import { Url } from "../database/models/url.js";
import { Session } from "../database/models/session.js";
import { Worker, WorkerStatus, WorkerType } from "../database/models/worker.js";
import { Domain } from "../database/models/domain.js";
import moment from "moment";
import config from "../config/index.js";

type DeregistrationOptions = {
    workerId: number;
    numberOfFinishedSubjects: number;
    message?: string;
}

export enum LOCK {
    UPDATE = 'UPDATE',
    SHARE = 'SHARE',
    /**
     * Postgres 9.3+ only
     */
    KEY_SHARE = 'KEY SHARE',
    /**
     * Postgres 9.3+ only
     */
    NO_KEY_UPDATE = 'NO KEY UPDATE',
}

export interface ResponseTask {
    id: number;
    timestamp?: Date;
    session?: Session;
    subject: {
        id: number;
        url: string;
        url_id: number;
        domain_id: number;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }
}

class DatabaseHelper {

    /**
     * Setup database connection
     */
    static async setup() {
        // Initialize database tables based on provided models
        await sequelize.sync()
    }

    /**
     * Register crawler in database by creating entry in worker table and setting attributes (started_at to time of call) and
     * status as ACTIVE.
     * @returns worker id if crawler was successfully registeredm otherwise nothing
     */
    static async registerCrawler() {
        try {
            const worker = await Worker.create({
                type: WorkerType.BROWSER,
                started_at: new Date(),
                status: WorkerStatus.ACTIVE
            })
            // Return id of worker that was created
            Logging.info(`Successfully registered crawler worker with id="${worker.id}"`)
            return worker.id;
        } catch (err: unknown) {
            // On error, return nothing and log error
            Logging.error(`(registerCrawler) Crawler registration failed. Error: ${(err as Error).toString()}`)
        }
    }

    /**
     * Deregister crawler from database and set all all subjects which were PROCESSING to UNVISITED.
     * @param param0 WorkerId, number of finished subjects and termination message to attach in database deregistration
     */
    static async deregisterCrawler({ workerId, numberOfFinishedSubjects, message }: DeregistrationOptions) {
        try {
            // Set all subjects which were PROCESSING by that worker to UNVISITED
            await SwapTask.update({
                status_name: DefaultTaskStatus.FREE,
            }, {
                where: {
                    status_name: DefaultTaskStatus.PROCESSING,
                    worker_id: workerId
                }
            })

            // Update table entry to reflect end date of crawl
            await Worker.update({
                status: WorkerStatus.FINISHED,
                finished_at: new Date(),
                subject_count: numberOfFinishedSubjects,
                message
            }, {
                where: { id: workerId },
            });
            Logging.info(`Successfully deregistered crawler worker with id="${workerId}"`)
        } catch (err: unknown) {
            Logging.error(`(deregisterCrawler) Crawler deregistration failed. Error: ${(err as Error).toString()}`)
        }
    }

    /**
     * Mark subject as finished in the database. Set final_url to the subject and its state to VISITED.
     * Afterwards, perform onUrlFinish callback to check whether assigned URL is also finished
     * 
     * @param taskId Subject to mark as finished
     */
    static async finishTask(taskId: number, error: boolean = false) {

        // get the task
        const task = await SwapTask.findOne({
            where: {
                id: taskId
            },
        })

        if (!task) {
            Logging.error(`(finishSubject) Task with id=${taskId} not found`)
            return;
        }


        if (task.is_live && !error) {
            // check if the task is live and whether the analysis task is still ongoing or we have free candidates
            const candidates = await SwapCandidate.count({
                where: {
                    task_id: taskId,
                    state: "free"
                }
            })

            const analysisTask = await AnalysisTask.findOne({
                where: {
                    subject_id: task.subject_id,
                    status_name: "processing",
                    is_live: true
                }
            })

            if (!!analysisTask || candidates > 0) {
                await SwapTask.update(
                    {
                        status_name: DefaultTaskStatus.FREE,
                        worker_id: null
                    }, {
                    where: {
                        id: taskId
                    },
                })

                return;
            }

        }

        try {
            // Update subject status to VISITED and assign final_url
            await SwapTask.update(
                {
                    status_name: DefaultTaskStatus.COMPLETED,
                    result_name: error ? "sce" : "scs",
                    visitation_end: new Date(),
                    worker_id: null
                }, {
                where: {
                    id: taskId
                },
            })
        } catch (err: unknown) {
            // On error, output error that happened
            Logging.error(`(finishSubject) Performing finishSubject failed. Error: ${(err as Error).toString()}`)
            console.log(err)
        }
    }


    /**
     * Get next entry for crawler to work on from database. Respect already set url id, domain id, session id, to ideally stay on same url/same domain work and by default always stay in same session.
     * If there are no subjects for an url left, go to work on subjects for the belonging domain and if there are no more for domain move on to new domain and different session. The invocation code
     * is at main.ts / passing through the respective arguments to the taskqeue.ts to here.
     * 
     * Skips locked rows and locks the fetched rows so other crawlers do not work in parallel on the same subjects. 
     * Invariant: 
     * - Searches in ascending creation date and start url to always work on oldest subjects first.
     * - Tries to always look for work which was attached to its crawler id, so crawler continue doing their scheduled tasks
     * 
     * After retrieving entries from database, it repacks them for the crawler and updates all entries so they belong to the crawler. Additionally, it is checked
     * whether the timeout limits are hit (e.g. per session, all subjects have to be worked on during session expiration limit from the account framework, so 24 hours). 
     * This interval is configured in the config.ts. Also applies to session-less subjects and then on domain entry creation time.
     * 
     * @param workerId Worker id to fetch work for
     * @param urlId UrlId the worker might already be working on
     * @param domainId DomainId the worker might be already working on 
     * @param sessionId 
     * @returns 
     */
    static async next(workerId: number): Promise<ResponseTask[]> {
        Logging.info(`(next) Fetching new work from database for worker with id="${workerId}"`)
        const nextTasks: ResponseTask[] = []
        const limit = 1;
        const t = await sequelize.transaction();
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const order: any = [
                ["created_at", "ASC"]
            ]
            // Find all subjects for the set parameters and order by ascending creation date
            let tasks = await SwapTask.findAll({
                where: {
                    status_name: DefaultSwapTaskStatus.FREE,
                    // ...(urlId && { url_id: urlId }),
                    // ...(sessionId && { session_id: sessionId }),
                    // ...(!sessionId && { session_id: null }),
                    worker_id: workerId
                },
                limit: limit,
                order: order,
                transaction: t,
                lock: {
                    of: SwapTask,
                    level: LOCK.UPDATE
                },
                skipLocked: true,
                include: [Subject]
            });

            // Check if there were still no found subjects
            if (tasks.length === 0) {
                // Fetch again, but not limited to single worker and without limitation to url/domain
                tasks = await SwapTask.findAll({
                    where: {
                        status_name: DefaultSwapTaskStatus.FREE,
                        worker_id: null
                    },
                    limit: limit,
                    order: order,
                    transaction: t,
                    skipLocked: true,
                    lock: {
                        of: SwapTask,
                        level: LOCK.UPDATE
                    },
                    include: [Subject]
                });
            }
            const skippedSubjects: number[] = [];
            // For each subject that will be listed as crawl, repack and set to PROCESSING
            for (let j = 0; j < tasks.length; j++) {
                const task = tasks[j]


                // check if the task is live and needs to not be live
                const currentTime = new Date();

                if (task.is_live && moment(currentTime).diff(task.updatedAt, 'seconds') >= ((config.maxTime.session) / 1000)) {

                    await SwapTask.update(
                        {
                            is_live: false,
                            status_name: DefaultSwapTaskStatus.WAITING_SESSION,
                            worker_id: null
                        },
                        {
                            where: {
                                id: task.id,
                            },
                            transaction: t
                        },
                    );

                    continue;

                }

                // Check if number of nextSubjects is below limit
                if (nextTasks.length < limit) {
                    // If yes, fetch url 
                    const url = await Url.findOne({
                        where: {
                            id: task.subject.url_id
                        },
                        lock: true,
                        transaction: t,
                        skipLocked: true,
                    })
                    // Check if url is not existing/rather not found due to being locked
                    if (!url) {
                        Logging.info("Skipped subject due to URL being locked by other crawler.")
                        continue;
                    }

                    // Check if url is not existing/rather not found due to being locked
                    const domain = await Domain.findOne({
                        where: {
                            id: task.subject.domain_id
                        },
                    })

                    if (!domain) {
                        Logging.info("Skipped subject due to no domain being fetched as well.");
                        continue;
                    }
                    // Repack crawl subject
                    const nextToVisit: ResponseTask = {
                        id: task.id,
                        timestamp: task.createdAt,
                        subject: {
                            id: task.subject.id,
                            url: task.subject.start_url,
                            url_id: task.subject.url_id,
                            domain_id: domain.id,
                        },
                        session: task.session
                    }

                    // Get the current time
                    const currentTime = new Date();



                    // Update subject status to processing for next subject
                    await SwapTask.update(
                        {
                            status_name: DefaultSwapTaskStatus.PROCESSING,
                            worker_id: workerId
                        },
                        {
                            where: {
                                id: task.id,
                            },
                            transaction: t
                        },
                    );

                    nextTasks.push(nextToVisit)
                }
            }

            // Commit transaction to the database
            await t.commit();

            // For all urls[discrepancy skippedSubjects vs. skippedUrls in naming, here urls are meant] which were skipped (e.g. due to session expiration) call url finish callback
            // for (let index = 0; index < skippedSubjects.length; index++) {
            //     const element = skippedSubjects[index];
            //     await DatabaseHelper.onUrlFinish(element, undefined);
            // }

            // If there was no more work fetched, show warning
            if (nextTasks.length == 0) {
                Logging.warn(`Worker ${workerId} is requesting subjects via /next but none exist. Terminating worker.`)
            }

            return nextTasks;
        } catch (err: unknown) {
            // If any error happened during execution, rollback transaction and show notice
            Logging.error(`(next) Failed to query next subjects. Error: ${(err as Error).toString()}`)

            // print the error stack
            Logging.error((err as Error).stack || "")
            await t.rollback();
        }

        // By default, return empty array (no work was fetched)
        return [];
    }
}

export default DatabaseHelper;