/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    Model,
    ModelCtor,
    Sequelize,
    SequelizeOptions,
} from "sequelize-typescript";
import { Domain } from "./models/domain.js";
import { Subject } from "./models/subject.js";
import { Url } from "./models/url.js";
import { Session, SessionGroup } from "./models/session.js";
import { Worker } from "./models/worker.js";
import { config } from "dotenv";
import { AnalysisCandidatePair, AnalysisCandidatePairResult, AnalysisTask, AnalysisTaskResult, PreanalysisTask, PreanalysisTaskResult, SwapCandidate, SwapTask, SwapTaskResult, TaskStatus, VisitTask, VisitTaskResult } from "./models/tasks.js";
config()

// If db is not setup, create connection
if (!(global as any).db) {
    const dbModels: ModelCtor<Model<any, any>>[] = [
        Domain,
        Subject,
        Url,
        Session,
        SessionGroup,
        Worker,

        // Task status
        TaskStatus,

        // Visit task
        VisitTaskResult,
        VisitTask,

        // Preanalysis task
        PreanalysisTaskResult,
        PreanalysisTask,

        // Analysis task
        AnalysisTaskResult,
        AnalysisTask,
        AnalysisCandidatePairResult,
        AnalysisCandidatePair,

        // Swap task
        SwapTaskResult,
        SwapTask,
        SwapCandidate

    ];

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const log = (query: string, timing?: number) => {
        // console.log(`${query} took ${timing} ms`);
    }

    let db: Sequelize;

    try {
        const options: SequelizeOptions = {
            host: process.env.POSTGRES_HOST!,
            dialect: "postgres",
            benchmark: true,
            logging: log,
            models: dbModels,
            // NOTE: Configure to database specifications
            pool: {
                max: 6,
                min: 0,
                acquire: 90000
            }
        };
        db = new Sequelize(
            process.env.POSTGRES_DB!,
            process.env.POSTGRES_USER!,
            process.env.POSTGRES_PASSWORD!,
            options
        );

        await db.sync();

        // Add default visit task results
        if (await TaskStatus.count() === 0) {
            await TaskStatus.bulkCreate([
                { name: "preparing", active: false, note: "Task is being prepared" },
                { name: "free", active: false, note: "Task is free to be taken" },
                { name: "selected", active: true, note: "Task is selected by a worker" },
                { name: "processing", active: true, note: "Task is being processed by a worker" },
                { name: "completed", active: false, note: "Task has been completed" },
                { name: "waiting_session", active: true, note: "Task is waiting for a session to be assigned" },
            ]);
        }

        if (await VisitTaskResult.count() === 0) {
            await VisitTaskResult.bulkCreate([
                { name: "mfs", success: true, note: "Mirroring full success (visits were identical)" },
                { name: "mps", success: true, note: "Mirroring partial success (visits were similar but some differences happened in visit)" },
                { name: "mfc", success: true, note: "Mirroring conducted successfully but somewhere in the middle synchronization issues happened between the two visits" },
                { name: "mer", success: false, note: "Error in framework occured" },
                { name: "mnl", success: false, note: "Mirroring failed because one or more sessions are not logged in" },
                { name: "mdp", success: false, note: "Mirroring failed because the pages for the two users look very different" },
                { name: "mni", success: false, note: "Mirroring not useful because no meaningful interactions to perform" },
                { name: "mpe", success: false, note: "Mirroring failed because of an error in the page" },
                { name: "mfo", success: false, note: "Mirroring failed for other reason" },
            ]);
        }


        if (await PreanalysisTaskResult.count() === 0) {
            await PreanalysisTaskResult.bulkCreate([
                { name: "pas", success: true, note: "Preanalysis successful" },
                { name: "pae", success: false, note: "Error in preanalysis occured" },
            ]);
        }


        if (await AnalysisTaskResult.count() === 0) {
            await AnalysisTaskResult.bulkCreate([
                { name: "as", success: true, note: "Analysis successful" },
                { name: "ae", success: false, note: "Error in analysis occured" },
                { name: "ac", success: false, note: "Analysis cancelled" }

            ]);
        }

        if (await AnalysisCandidatePairResult.count() === 0) {
            await AnalysisCandidatePairResult.bulkCreate([
                { name: "cpv", success: true, note: "Candidate pair valid: clearly vulnerable request" },
                { name: "cpp", success: true, note: "Candidate pair possible: might require auxiliary information" },
                { name: "cpd", success: true, note: "Candidate pair hard to swap: might contain procedural generation of identifiers" },
                { name: "cps", success: false, note: "Candidate pair require establishing a specific session" },
                { name: "cpn", success: false, note: "Candidate pair not immediately vulnerable: no vulnerability found or identifiers might be random" },
                { name: "cpx", success: false, note: "Requests are not functionally similar: they do not refer to the same API or resource" },
                { name: "cpi", success: false, note: "Ignore this candidate pair" },
                { name: "cpe", success: false, note: "Error in analysis occured" },
            ]);
        }

        if (await SwapTaskResult.count() === 0) {
            await SwapTaskResult.bulkCreate([
                { name: "scs", success: true, note: "Swap crawl successful" },
                { name: "sce", success: false, note: "Error in swap crawl occured" },
                { name: "scc", success: false, note: "Swap crawl cancelled" },
            ]);
        }

    } catch (err) {
        console.log(err);
        db = null!;
    }

    (global as any).db = db;
}

export const sequelize = (global as any).db;
