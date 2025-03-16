import { BlobReader, TextWriter, ZipReader } from "@zip.js/zip.js";
import fs from "fs";


export async function readText(entryName: string, localZipFP: string): Promise<string | undefined> {

    const reader = new ZipReader(new BlobReader(new Blob([fs.readFileSync(localZipFP)])));
    const entries = await reader.getEntries();
    const entry = entries.find((e: any) => e.filename === entryName);
    if (!entry || !entry.getData) {
        return undefined;
    }
    const textWriter = new TextWriter();
    await entry.getData(textWriter);
    return textWriter.getData();
}


type Point = {
    x: number,
    y: number,
};

type BrowserContextOptionsEvent = {
    type: "context-options",
    wallTime: number,
}

type BeforeActionTraceEvent = {
    type: 'before',
    callId: string;
    startTime: number;
    apiName: string;
    class: string;
    method: string;
    params: Record<string, any>;
    stepId?: string;
    beforeSnapshot?: string;
    stack?: any[];
    pageId?: string;
    parentId?: string;
};


type InputActionTraceEvent = {
    type: 'input',
    callId: string;
    inputSnapshot?: string;
    point?: Point;
};

type AfterActionTraceEvent = {
    type: 'after',
    callId: string;
    endTime: number;
    afterSnapshot?: string;
    error?: any;
    attachments?: any[];
    result?: any;
    point?: Point;
};


type FrameSnapshot = {
    snapshotName?: string,
    callId: string,
    pageId: string,
    frameId: string,
    frameUrl: string,
    timestamp: number,
    collectionTime: number,
    doctype?: string,
    html: any,
    resourceOverrides: any[],
    viewport: { width: number, height: number },
    isMainFrame: boolean,
};

type FrameSnapshotTraceEvent = {
    type: 'frame-snapshot',
    snapshot: FrameSnapshot,
};


type Event = BeforeActionTraceEvent | InputActionTraceEvent | AfterActionTraceEvent | FrameSnapshotTraceEvent;

type BaseTraceReport = {
    type: string,
    wallTime: number;
    frameId: string,
    pageId: string,
    frameUrl: string,
    isMainFrame: boolean,
}

type ActionTraceReport = BaseTraceReport & {
    type: 'action';
    apiName: string;
    params: any;
    before: BeforeActionTraceEvent;
    after: AfterActionTraceEvent;
}

type InputTraceReport = BaseTraceReport & {
    type: 'input';
    wallTime: number;
    input: InputActionTraceEvent;
}

const ALLOWED_API_NAMES = [
    "frame.click", 
    "page.goto"
]

export type EventTraceReport = ActionTraceReport | InputTraceReport;

function* _eventsIterator(tracesText: string): Generator<Event | BrowserContextOptionsEvent, undefined, void> {
    for (const line of tracesText.split("\n")) {
        if (line === "") {
            continue;
        }

        const event = JSON.parse(line);
        yield event;
    }

    return undefined;
}

export async function readActionTraces(localZipFP: string, options: { allowedApiNames?: string[] } = {allowedApiNames: ALLOWED_API_NAMES}): Promise<{ events: EventTraceReport[], tracesText: string }> {
    const tracesText = await readText("trace.trace", localZipFP);

    if (!tracesText) {
        throw new Error("No trace.trace file found in the zip file");
    }

    const eventsIterator = _eventsIterator(tracesText!);

    const contextEvent: BrowserContextOptionsEvent = eventsIterator.next().value as BrowserContextOptionsEvent;

    const events: EventTraceReport[] = [];

    const pendingActions: Record<string, BeforeActionTraceEvent> = {};
    const actionSnapshots: Record<string, FrameSnapshotTraceEvent> = {};

    for (const event of eventsIterator) {
        if (event.type == "before") {

            if (!options.allowedApiNames?.includes((event as BeforeActionTraceEvent).apiName)) {
                continue;
            }

            // update wallTime
            // The original equation is substracting the startTime of context chunks, but since we will not have
            // any context chunk, we can remove this substraction.
            const beforeActionEvent = event as BeforeActionTraceEvent;
            pendingActions[beforeActionEvent.callId] = beforeActionEvent;
        }
        else if (event.type == "after") {
            const afterActionEvent = event as AfterActionTraceEvent;
            const beforeActionEvent = pendingActions[afterActionEvent.callId];
            if (!beforeActionEvent) continue;

            const frameSnapshotEvent = actionSnapshots[beforeActionEvent.beforeSnapshot!];
            if (!frameSnapshotEvent) {
                console.warn(`No frame snapshot event found for snapshot ${beforeActionEvent.beforeSnapshot}`);
            }
            events.push({
                wallTime: contextEvent.wallTime + beforeActionEvent.startTime,
                before: beforeActionEvent,
                after: afterActionEvent,
                frameId: frameSnapshotEvent?.snapshot.frameId,
                pageId: frameSnapshotEvent?.snapshot.pageId,
                frameUrl: frameSnapshotEvent?.snapshot.frameUrl,
                isMainFrame: frameSnapshotEvent?.snapshot.isMainFrame,
                type: 'action',
                apiName: beforeActionEvent.apiName,
                params: beforeActionEvent.params,
            });

            delete pendingActions[afterActionEvent.callId];

            if (beforeActionEvent.beforeSnapshot)
            delete actionSnapshots[beforeActionEvent.beforeSnapshot!];

        } else if (event.type == "frame-snapshot") {
            const frameSnapshotEvent = event as FrameSnapshotTraceEvent;
            if (!frameSnapshotEvent.snapshot.snapshotName) continue;
            actionSnapshots[frameSnapshotEvent.snapshot.snapshotName] = frameSnapshotEvent;
        }
        else if (event.type == "input") {
            const inputEvent = event as InputActionTraceEvent;
            const beforeEvent = pendingActions[inputEvent.callId];
            if (!beforeEvent) {
                console.log(`[WARN] No before action event found for callId ${inputEvent.callId}, skipping this input event.`);
                continue;
            }

            const frameSnapshotEvent = actionSnapshots[beforeEvent.beforeSnapshot!];
            if (!frameSnapshotEvent) {
                console.warn(`No frame snapshot event found for snapshot ${beforeEvent.beforeSnapshot}`);
            }

            events.push({
                wallTime: contextEvent.wallTime + beforeEvent.startTime,
                input: inputEvent,
                type: 'input',
                frameId: frameSnapshotEvent?.snapshot.frameId,
                pageId: frameSnapshotEvent?.snapshot.pageId,
                frameUrl: frameSnapshotEvent?.snapshot.frameUrl,
                isMainFrame: frameSnapshotEvent?.snapshot.isMainFrame
            });
        }
    }

    return {
        events,
        tracesText
    }

}