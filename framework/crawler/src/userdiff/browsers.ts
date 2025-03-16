import { Leader, Follower, FollowerParams, SignalingServer } from "playwright-mirror";
import { LeaderParams } from "playwright-mirror";
import { Session, SessionGroup } from "../database/models/session.js";
import UserDiffManual from "../modules/userdiff_manual.js";
import { Subject } from "../database/models/subject.js";
import { Task } from "../types/task.js";
import kill from "tree-kill";
import { SignalingServerParams } from "../../../playwright/playwright-mirror/lib/esm/server.js";
import { VisitTask } from "../database/models/tasks.js";

export async function resetDataForSubject(subject: Subject) {
    const module = new UserDiffManual();
    await module.cleanForSubject(subject);
}


async function attachModule(client: any, visitTask: VisitTask, subject: Subject, sessionIndex: number, page: any) {

    const sessions = await Session.findAll({
        where: {
            group_id: subject.session_group_id
        },
        include: [SessionGroup]
    })

    if (sessions?.length <= sessionIndex) {
        throw new Error("Session index out of bounds");
    }

    const module = new UserDiffManual();

    await module.register({
        id: visitTask.id,
        subject:{
        url: subject.start_url,
        url_id: subject.url_id,
        domain_id: subject.domain_id,
        id: subject.id
        },
        session: sessions[sessionIndex]
    })

    await module.before(page);

    client.module = module;

    return client;
}


export async function startSignalingServer(visitTask: VisitTask, subject: Subject, params: SignalingServerParams) {
    const signalingServer = new SignalingServer(params);

    const module = new UserDiffManual();

    await module.register({
        id: visitTask.id,
        subject:{
        id: subject.id,
        url: subject.start_url,
        url_id: subject.url_id,
        domain_id: subject.domain_id,
        },
    });

    (signalingServer as any).module = module;
    module.eventsFrom(signalingServer);

    await signalingServer.start();
}


export async function startLeader(visitTask: VisitTask, subject: Subject, params: LeaderParams) {

    let leader = new Leader(params);

    await leader.start();

    const page = await leader.browserContext.newPage();

    leader = await attachModule(leader, visitTask, subject, 0, page);

    await page.goto((leader as any).module.task.subject.url);

    return leader;

}


export async function startFollower(visitTask: VisitTask, subject: Subject, params: FollowerParams) {

    let follower = new Follower({
        ...params,
        autoCreatePage: false,
        onStop: async () => {
            await (follower as any).module?.finish(null);
        }
    });

    // Make sure the browser is killed for the follower when the follower is killed

    await follower.start({
        onBrowserConnected: async () => {
            await follower.browserContext.tracing.start({ screenshots: false, snapshots: true });
            const page = await follower.browserContext.newPage();
            follower.setPage(page);
            follower = await attachModule(follower, visitTask, subject, 1, page);
            await page.goto((follower as any).module.task.subject.url);
        }
    });

    return follower;

}