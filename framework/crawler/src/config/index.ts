
import parser from "./parser.js";

const args = parser.parse_args()


type CrawlMode = "test" | "connected";


export type Config = {
    mode: CrawlMode,
    flags: string[],
    academicMarker: string,
    headfull: boolean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dynamic: any,
    goto: {
        timeout: number,
        waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit"
    },
    timeouts: {
        restart: number,
        sameSite: number,
        moduleExec: number
    },
    sessions: {
        screenshotMaxDepth: number,
        screenshotBefore: boolean,
        screenshotAfterwards: boolean,
        includeLoginpages: boolean,
    },
    screenshotEndTreshold: number,
    maxTime: {
        session: number,
        domain: number,
        url: number,
        subject: number
    },
    dataPath: string,
    command: string[]
}

const flags: string[] = [

];

const config: Config = {
    mode: args.test ? "test" : "connected",
    headfull: args.headfull,
    academicMarker: "ACADEMIC CRAWLER FROM https://anonymized.notfound/crawler.html",
    flags,
    goto: {
        // All values are in Milliseconds, so * 1000
        timeout: 30 * 1000,
        waitUntil: "load",
    },
    timeouts: {
        // All values are in Milliseconds, so * 1000
        restart: 120 * 1000,
        sameSite: 2 * 1000,
        moduleExec: 10 * 1000
    },
    sessions: {
        screenshotMaxDepth: 0,
        screenshotBefore: true,
        screenshotAfterwards: true,
        includeLoginpages: true
    },
    maxTime: {
        // All values are in Milliseconds, so * 1000
        session: 86400 * 1000,
        domain: 86400 * 1000,
        url: 86400 * 1000,
        subject: 3600 * 1000
    },
    screenshotEndTreshold: 1800 * 1000,
    dataPath: args.datapath,
    dynamic: args,
    command: args.command? args.command.split(" ") : []
};

export default config;