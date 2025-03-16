#!/usr/bin/env node

import { Command } from "commander";
import { startManualWorkSession } from "./userdiff/manual.js";
import { Subject } from "./database/models/subject.js";
import { startFollower, startLeader, startSignalingServer } from "./userdiff/browsers.js";
import { SessionGroup } from "./database/models/session.js";
import config from "./config/index.js";
import { VisitTask } from "./database/models/tasks.js";

const program = new Command();
program.version("1.0.0").description("Crawler CLI");


// Manual Crawl
program
  .command("manual-work")
  .description("Manual Work command")
  .option("-l, --live", "Live mode")
  .action(async (options: { live: boolean }) => {
    await startManualWorkSession(options);
  }
  );


program
  .command("internal:server", { hidden: true })
  .description("Start the signaling server")
  .argument("<visitTaskId>", "Visit Task ID to process")
  .argument("<subjectId>", "Subject ID to process")
  .option("-p, --port <port>", "Port to start the signaling server on")
  .option("-h, --host <host>", "Host to start the signaling server on")
  .option("-s, --strict", "Strict mode")
  .option(
    "-e, --expected-followers <expectedFollowers>",
    "Expected number of followers"
  )
  .action(async (visitTaskId, subjectId, options: { port: number; host: string; strict: boolean; expectedFollowers: number }) => {

    const visitTask = await VisitTask.findOne({
      where: {
        id: visitTaskId
      }
    });

    if (!visitTask) {
      console.error("Visit Task not found");
      process.exit(1);
    }

    const subject = await Subject.findOne({
      where: {
        id: subjectId
      },
      include: [SessionGroup]
    });

    if (!subject) {
      console.error("Subject not found");
      process.exit(1);
    }

    startSignalingServer(visitTask, subject, {
      port: options.port,
      host: options.host,
      strict: options.strict,
      expectedFollowers: options.expectedFollowers,
      blockedActions: ['openPage'],
    });
  });

program
  .command("internal:follower", { hidden: true })
  .description("Start the follower client")
  .argument("<visitTaskId>", "Visit Task ID to process")
  .argument("<subjectId>", "Subject ID to process")
  .option("-w, --ws-endpoint <wsEndpoint>", "WebSocket endpoint to connect to")
  .option(
    "-b, --browser-ws-endpoint <browserWsEndpoint>",
    "Browser WebSocket endpoint to connect to"
  )
  .option(
    "-s, --storage <storage>",
    "Path to the storage file to save the session to"
  )
  .option(
    "-r, --recorder-output-path <recorderOutputPath>",
    "Path to the recorder output file"
  )
  .option(
    "-t, --trace-output-path <traceOutputPath>",
    "Path to the trace output file"
  )
  .action(async (visitTaskId, subjectId, options: { wsEndpoint: string; browserWsEndpoint: string; storage: string; url: string, recorderOutputPath?: string, traceOutputPath?: string }) => {

    const visitTask = await VisitTask.findOne({
      where: {
        id: visitTaskId
      }
    });

    if (!visitTask) {
      console.error("Visit Task not found");
      process.exit(1);
    }

    const subject = await Subject.findOne({
      where: {
        id: subjectId
      },
      include: [SessionGroup]
    });

    if (!subject) {
      console.error("Subject not found");
      process.exit(1);
    }

    startFollower(visitTask, subject, {
      wsEndpoint: options.wsEndpoint,
      browserWsEndpoint: options.browserWsEndpoint,
      storage: options.storage,
      url: options.url,
      recorderOutputPath: options.recorderOutputPath,
      traceOutputPath: options.traceOutputPath
    });

  });


program
  .command("internal:leader", { hidden: true })
  .description("Start the leader client")
  .argument("<visitTaskId>", "Visit Task ID to process")
  .argument("<subjectId>", "Subject ID to process")
  .option("-w, --ws-endpoint <wsEndpoint>", "WebSocket endpoint to connect to")
  .option(
    "-s, --storage <storage>",
    "Path to the storage file to save the session to"
  )
  .option(
    "-r, --recorder-output-path <recorderOutputPath>",
    "Path to the recorder output file"
  )
  .action(async (visitTaskId, subjectId, options: { wsEndpoint: string; browserWsEndpoint: string; storage: string; url: string, recorderOutputPath?: string }) => {

    const visitTask = await VisitTask.findOne({
      where: {
        id: visitTaskId
      }
    });

    if (!visitTask) {
      console.error("Visit Task not found");
      process.exit(1);
    }

    const subject = await Subject.findOne({
      where: {
        id: subjectId
      },
      include: [SessionGroup]
    });

    if (!subject) {
      console.error("Subject not found");
      process.exit(1);
    }

    startLeader(visitTask, subject, {
      wsEndpoint: options.wsEndpoint,
      storage: options.storage,
      url: options.url,
      recorderOutputPath: options.recorderOutputPath
    });

  });

program.parse([process.argv[0], process.argv[1], ...config.command]);
