import { config as dotEnvConfig } from "dotenv";
// Load environment variables
dotEnvConfig()

import { Op } from "sequelize";
import { sequelize } from "../../database/db.js";
import { Session, SessionGroup, SessionStatus } from "../../database/models/session.js";
import { Subject } from "../../database/models/subject.js";
import { SubjectFactory } from "../factories/subject-factory.js";
import { Logging } from "../logging.js";
import { ZMQ_EXPERIMENT, ZMQWrapper, ZMQWrapperTest } from "./zmq-wrapper.js";
import parser from "../../config/parser.js";
import moment from "moment"; // eslint-disable-line
import config from "../../config/index.js";
import * as schedule from "node-schedule";
import { DefaultSwapTaskStatus, DefaultTaskStatus, SwapTask, TaskStatus, VisitTask } from "../../database/models/tasks.js";

const N_WORKERS: number = process.env.N_WORKERS ? parseInt(process.env.N_WORKERS) : 1;

const args = parser.parse_args()
let sessionCount = 0;

interface ZMQConfigurationTestMode {
    enabled: boolean; // Flag whether testmode is enabled
    maxSessionCount: number; // Flag how many sessions to fetch at max in testmode
}

interface ZMQConfiguration {
    testMode?: ZMQConfigurationTestMode;
}

// Configuration for ZMQ listener
const listenerConfiguration: ZMQConfiguration = {
    testMode: {
        enabled: config.dynamic.demo,
        maxSessionCount: Number.MAX_SAFE_INTEGER // NOTE: Set to smaller number to reduce number of test sessions generated
    }
};
// Retrieve arguments from command line. Required:
// - crawlers for count of running crawlers
// - fetchinterval as number of seconds of wait time between fetching from account framework
// If any arguments are missing, aborting the zmq listener process.
if (!args.crawlers) {
    Logging.error("No crawler count has been supplied. Terminating")
    process.exit(-1);
}
const PARALLEL_CRAWLER_COUNT: number = args.crawlers;

if (!args.fetchinterval) {
    Logging.error("No fetching interval specified. Terminating")
    process.exit(-1);
}
const ZMQ_FETCH_INTERVAL: number = args.fetchinterval;

if (ZMQ_FETCH_INTERVAL < 60) {
    Logging.warn("Fetching interval for sessions is relatively high. This might introduce lack of sessions and unexpected load on ZMQ server.")
}

if (PARALLEL_CRAWLER_COUNT % 2 !== 0) {
    Logging.warn("Detected usage unequal number of crawlers. This might introduce unwanted issues, use with caution")
}

const siteList: string[] = [];

const _fetchNewSessions = async (zmqSession: ZMQWrapper | ZMQWrapperTest, requestSite?: any) => {
    // Retrieve session zmq session (site is passed as optional, if undefined ignored by wrapper function)
    const sessions: Session[] | undefined = await zmqSession.getSessions(requestSite, 2);
    // Check if wrapper returned a session
    if (sessions && sessions.length > 0) {
        // If sessions were successfully requested, write to database
        const session = sessions[0];
        const sessionGroup = await SessionGroup.findOne(
            {
                where: {
                    id: session.group_id,
                },
                include: [Session]
            }
        )

        if (!sessionGroup) throw new Error("Session Group not found for session. this is likely an issue in how sessions are saved.")

        const { landing_page } = session.session_information.account.website;
        Logging.info(`Attempting to create a new subject for fetched session for landing_page ${landing_page}`);
        // Increment number of fetched sessions so far
        sessionCount++;

        let additionalInfo = {}
        // Store login form address for subject without session for screenshotting
        if (session.session_information.loginform) {
            const { formurl, formurlfinal, success } = session.session_information.loginform
            additionalInfo = {
                formurl, formurlfinal, success
            }
        }

        try {
            // Create subject for session with session linked first
            const subject = await SubjectFactory.createSubjectFromUrlString(landing_page, 0, additionalInfo, sessionGroup, undefined, undefined,)

        } catch (err: unknown) {
            console.log(err);
            Logging.error(`Failed to create new subject for session id="${session.id}" with context.`)
        }


        Logging.info(`Created one new subject for fetched session for landing_page ${landing_page}`);

        return true;
    } else {
        // If session was not requested successfully, re-add in sitelist to work on if it was set (try later again)
        if (requestSite) {
            // Re-attempt to fetch session for that site
            siteList.push(requestSite);
        }
        Logging.warn(`No new session fetched via ZMQ.`)

        return false;
    }
}

const _fetchSessionsForExistingTasks = async (zmqSession: ZMQWrapper | ZMQWrapperTest, tasks: VisitTask[]) => {

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const sessionGroup = await SessionGroup.findOne({
            where: {
                id: task.subject.session_group_id
            },
            include: [Session]
        })

        if (!sessionGroup) {
            Logging.error(`Session group not found for task id=${task.id}`)
            continue;
        }

        const site = sessionGroup.site;

        const newSessions = await zmqSession.getSessions(site, 2);

        if (!newSessions || newSessions.length < 2) {
            Logging.warn(`No new session fetched via ZMQ.`)
            continue;
        }

        // the ZMQ wrapper should update the same session group
        // update the task to be free

        await task.update({
            status_name: DefaultTaskStatus.FREE,
        })

        Logging.info(`Fetched new session for existing task id=${task.id}`)

        return true;

    }

    // if we reach here, we did not find any session for the tasks
    return false;

}

/**
 * Fetches a session from the account framework, depending on whether crawlers are available to work on one (e.g. not busy and limit of two crawler per session is also exceeded).
 * It queues first a subject with the session linked and afterwards one without attached session, so crawlers which work on oldest subject first, begin by working on
 * session with attached session, to release session asap after being done.
 * 
 */
const fetchSessions = async () => {
    if (listenerConfiguration.testMode && listenerConfiguration.testMode.maxSessionCount) {
        if (sessionCount >= listenerConfiguration.testMode.maxSessionCount) {
            return;
        }
    }
    // Initialize ZMQ wrapper depending on configuration with test element or real
    const zmqSession = !listenerConfiguration.testMode?.enabled ? new ZMQWrapper() : new ZMQWrapperTest();
    await zmqSession.init();
    // Assign session count
    zmqSession.sessionCount = sessionCount;

    // Check if there are new sessions needed and then fetch
    const unvisitedSubjects = await VisitTask.count({
        where: {
            status_name: DefaultTaskStatus.FREE
        }
    })

    // If there are any subjects available for crawlers to work on, return
    if (unvisitedSubjects > 3) {
        Logging.info("Not fetching new session since available subjects exist.")
        return;
    }

    // If number of sessions does not suffice, but there are no workers which are active, return
    // if (workersInactive === 0) {
    //     Logging.info("Not fetching new subjects since all workers have tasks in crawler pool.")
    //     return;
    // } else {
    // Retrieve first entry from sitelist (undefined if not existing)

    const requestSite = siteList.shift();
    // If site to be requested is undefined and there is zmqlist to work on configured, return (list is finished)
    if (config.dynamic.zmqlist && !requestSite) {
        Logging.warn(`Not fetching new session from ZMQ since it has finished site list.`)
        return;
    }


    // Check if existing tasks are waiting for new sessions
    const preparingTasks = await VisitTask.findAll({
        where: {
            status_name: DefaultTaskStatus.PREPARING
        },
        include: [Subject]
    })

    if (preparingTasks.length > 0) {

        // randomly choose whether to fetch a new session or one for the preparing tasks
        const choice = Math.random() > 0.5;

        if (choice) {
            const found = await _fetchNewSessions(zmqSession, requestSite);
            if (!found) await _fetchSessionsForExistingTasks(zmqSession, preparingTasks);
        }
        else {
            const found = await _fetchSessionsForExistingTasks(zmqSession, preparingTasks);
            if (!found) await _fetchNewSessions(zmqSession, requestSite);
        }

    }
    else {
        _fetchNewSessions(zmqSession, requestSite);
    }


}

const fetchSwapSessions = async () => {
    if (listenerConfiguration.testMode && listenerConfiguration.testMode.maxSessionCount) {
        if (sessionCount >= listenerConfiguration.testMode.maxSessionCount) {
            return;
        }
    }

    const zmqSession = !listenerConfiguration.testMode?.enabled ? new ZMQWrapper() : new ZMQWrapperTest();
    await zmqSession.init();
    // Assign session count
    zmqSession.sessionCount = sessionCount;

    // Check if there are new sessions needed and then fetch
    const unvisitedSubjects = await SwapTask.count({
        where: {
            status_name: DefaultSwapTaskStatus.FREE
        }
    })

    // If there are any subjects available for crawlers to work on, return
    if (unvisitedSubjects > N_WORKERS * 1.2) {
        Logging.info(`Not fetching new session since available subjects exist: ${unvisitedSubjects} while workers are ${N_WORKERS}.`)
        return;
    }

    // count distinct worker_id where SwapTask status_name is processing
    const workersInactive = N_WORKERS - await SwapTask.count({
        distinct: true,
        col: 'worker_id',
        where: {
            status_name: DefaultSwapTaskStatus.PROCESSING
        }
    })


    // If number of sessions does not suffice, but there are no workers which are active, return
    if (workersInactive <= 0) {
        Logging.info("Not fetching new subjects since all workers have tasks in crawler pool.")
        return;
    }

    const task = await SwapTask.findOne(
        {
            where: {
                status_name: DefaultSwapTaskStatus.WAITING_SESSION
            },
            include: [Subject]
        }
    )

    if (!task) {
        Logging.warn(`No new session fetched via ZMQ.`)
        return;
    }

    // get the account id of the first session
    const sessionGroup = await SessionGroup.findOne({
        where: {
            id: task.subject.session_group_id
        },
        include: [Session]
    })

    if (!sessionGroup) {
        Logging.error(`Session group not found for task id=${task.id}`)
        return;
    }

    const session1 = sessionGroup.sessions[0]
    const sessionInformation = session1.session_information
    const accountId = sessionInformation.account?.id;
    const site = sessionGroup.site;

    if (!accountId) {
        Logging.error(`Account id not found for task id=${task.id}`)
        return;
    }

    const session = await zmqSession.getSession(site, accountId);

    if (!session) {
        Logging.warn(`No new session fetched via ZMQ.`)
        return;
    }

    // update the task
    await task.update({
        status_name: DefaultSwapTaskStatus.FREE,
        session_id: session.id
    })

    // Increment number of fetched sessions so far
    sessionCount++;

    Logging.info(`Fetched new session for swap task id=${task.id}`)

}

/**
 * Unlock all active sessions for which no work is present anymore. 
 */
const unlockSessions = async () => {
    const currentTime = new Date();
    const sessions = await Session.findAll({
        where: {
            session_status: SessionStatus.ACTIVE
        },
        include: [SessionGroup]
    });
    Logging.info("Starting session unlocking cronjob.")
    // For each session, check if session is expired due to configuration or no work present anymore
    for (let index = 0; index < sessions.length; index++) {
        const element = sessions[index];

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (moment(currentTime).diff((element as any).updated_at, 'seconds') >= ((config.maxTime.session) / 1000)) {
            // If session is  older than maxTime per session plus potential screenshotting treshold: unlock the session without ZMQ
            await Session.update({
                session_status: SessionStatus.UNLOCKED,
                additional_information: {
                    message: "Unlocked only in database due to session being expired in zmq connection."
                }
            }, {
                where: {
                    id: element.id
                }
            })
        } else {

            let taskCount = 0;

            if (ZMQ_EXPERIMENT == "swap") {

                taskCount = await SwapTask.count({
                    where: {
                        session_id: element.id,
                    },
                    include: [{
                        model: TaskStatus, where: {
                            [Op.or]: [
                                { name: DefaultSwapTaskStatus.FREE },
                                { active: true }
                            ]
                        }
                    }]
                })

            } else {

                taskCount = await VisitTask.count({
                    include: [{
                        model: Subject, where: {
                            session_group_id: element.group.id
                        }
                    }, {
                        model: TaskStatus, where: {
                            [Op.or]: [
                                { name: DefaultTaskStatus.FREE },
                                { active: true }
                            ]
                        }
                    }]
                })
            }

            // If there are no subjects for that session (=session is done), unlock it
            if (taskCount === 0) {
                const zmqSession = !listenerConfiguration.testMode?.enabled ? new ZMQWrapper() : new ZMQWrapperTest();
                await zmqSession.init();
                await zmqSession.unlockSession(element.id)
            }
        }
    }

    Logging.info("Finished session unlocking cronjob")
}

/**
 * Main entry function for zmq listener class, runs fetchSession in configured time interval (in seconds) and
 * schedules session unlocking as a cronjob running every minute.
 */
async function zmqListen(fetchSessionFunction: () => Promise<void>) {
    Logging.info("Started ZMQ listener.")

    // Connect to database
    await sequelize.sync();
    let interval: NodeJS.Timeout | undefined;

    // Fetch session for first time
    await fetchSessionFunction();
    try {
        // Start interval functions to re-run fetching session periodically
        interval = setInterval(async () => {
            await fetchSessionFunction();
        }, ZMQ_FETCH_INTERVAL * 1000);
    } catch (err: unknown) {
        // On error, stop session fetcher
        if (interval) {
            clearInterval(interval);
        }
        Logging.error(`ZMQ-Listener broke down. Error: ${(err as Error).toString()}`);
    }

    // Schedule unlocking function every minute
    schedule.scheduleJob('*/1 * * * *', async function () {
        await unlockSessions();
    });
}

// Start main function

if (ZMQ_EXPERIMENT == "userdiff_manual") {
    zmqListen(fetchSessions);
} else if (ZMQ_EXPERIMENT == "swap") {
    zmqListen(fetchSwapSessions);
} else {
    Logging.error("No valid ZMQ experiment type specified. Terminating.")
    process.exit(-1);
}

export { zmqListen }