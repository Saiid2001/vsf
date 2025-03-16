import { Session } from "../database/models/session.js";
import { Subject } from "../database/models/subject.js"
import { storeSessionInfo } from "../utils/sessions.js";
import { SwapRequest } from "./swap_request.js";

type ExperimentInfo = {
    subject: Subject;
    baseSessionId: number;
    swapRequests: SwapRequest[];
}


export async function startSwapSession(experimentInfo: ExperimentInfo) {

    const baseSession = await Session.findByPk(experimentInfo.baseSessionId);

    if (!baseSession) {
        throw new Error("Base session not found");
    }

    const sessionPath = storeSessionInfo(experimentInfo.subject, baseSession, "swap_sessions");

    var browser



}