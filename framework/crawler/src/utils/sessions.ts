import * as fs from "fs";
import { Subject } from "../database/models/subject.js";
import { Session } from "../database/models/session.js";
import path from "path";
import config from "../config/index.js";

export function storeSessionInfo(subject: Subject, session: Session, baseFolder: string = "sessions") {

    const sessionPath = path.join(config.dataPath, baseFolder);
    if (!fs.existsSync(sessionPath)) {
        // If it does not exist, create the folder
        fs.mkdirSync(sessionPath, { recursive: true })
    }

    // Check if for crawler there is already a session json stored on disk
    const filePath = path.join(sessionPath, `state-${subject.id}-${session.id}.json`);
    if (fs.existsSync(filePath)) {
        // If so, delete that session file
        fs.rmSync(filePath);
    }

    // Write the session to disk
    fs.writeFileSync(filePath, JSON.stringify(session.session_data, null, 2), { encoding: "utf-8" })

    return filePath;
}