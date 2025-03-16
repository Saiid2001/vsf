/* eslint-disable @typescript-eslint/no-explicit-any */
import { Session } from "../database/models/session.js";
import { SubjectType } from "../database/models/subject.js";

export interface Context {
    session_id: number;
    session_data: any;
}

export interface Task {
    id: number;
    subject: {
        id: any;
        url: string;
        url_id?: number;
        domain_id?: number;
    },
    result?: any;
    session?: Session;
    is_live?: boolean;
}