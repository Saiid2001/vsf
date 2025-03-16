import { config as dotEnvConfig } from "dotenv";
// Load environment variables
dotEnvConfig()

import { Logging } from "../../utils/logging.js";
import Crawler from "./index.js";
import config from "../../config/index.js";
import { Subject, SubjectType } from "../../database/models/subject.js";
import { Session } from "../../database/models/session.js";
import { Url } from "../../database/models/url.js";
import { sequelize } from "../../database/db.js";
import DatabaseHelper from "../../utils/database-helper.js";
import { SwapTask } from "../../database/models/tasks.js";

(async () => {

    // Assign passed id to crawler
    const crawler = new Crawler()
    await crawler.setup(config.dynamic.module);
    crawler.id = config.dynamic.crawler

    // Fetch assigned subject
    const task = await SwapTask.findOne({
        where: {
            id: config.dynamic.task
        },
        include: [Session, Subject]
    })
    if (!task) {
        return;
    }

    try {
        const crawlerTask = {
            id: task.id,
            subject: {
                id: task.subject.id,
                url: task.subject.start_url,
                url_id: task.subject.url_id,
                domain_id: task.subject.domain_id,
            },
            session: task.session,
            result: task.result,
            is_live: task.is_live
        }
        await crawler.visit(crawlerTask)

    } catch (err: unknown) {
        // On error, save error in subject additional information and mark it as skip
        Logging.error(`Fatal error during visit.ts occured. Error: ${(err as Error).toString()}`)
        // await DatabaseHelper.skipSubject(subject.id, subject.url_id, (err as Error).toString())
    } finally {
        // After visiting, close database connection and exist process
        await sequelize.close();
        process.exit(0)
    }
})()

const termination = (signal: string): NodeJS.SignalsListener => {
    return () => {
        setTimeout(async () => {
            Logging.error(`Crawler visit process got terminated with signal ${signal}.`)
            await sequelize.close();
            process.exit(1);
        }, 1).unref();
    };
}

process
    .on('SIGTERM', termination('SIGTERM'))
    .on('SIGINT', termination('SIGINT'));