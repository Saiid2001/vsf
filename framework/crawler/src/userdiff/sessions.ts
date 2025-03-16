import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { wait } from "../utils/misc.js";
import { Subject } from "../database/models/subject.js";
import config from "../config/index.js";
import { Session } from "../database/models/session.js";
import path from "path";
import * as fs from "fs";
import kill from "tree-kill";
import { storeSessionInfo } from "../utils/sessions.js";
import { VisitTask } from "../database/models/tasks.js";

// import { createRequire } from "module";

// const require = createRequire(import.meta.url);

type ExperimentInfo = {
  subject: Subject;
  visitTask: VisitTask;
}


function _createLogPaths() {
  const logPath = path.join(config.dataPath, "logs", "mirroring");
  if (!fs.existsSync(logPath)) {
    // If it does not exist, create the folder
    fs.mkdirSync(logPath, { recursive: true })
  }

  // create log files

  if (!fs.existsSync(path.join(logPath, "server.log"))) fs.writeFileSync(path.join(logPath, "server.log"), "", { encoding: "utf-8" });
  if (!fs.existsSync(path.join(logPath, "leader.log"))) fs.writeFileSync(path.join(logPath, "leader.log"), "", { encoding: "utf-8" });
  if (!fs.existsSync(path.join(logPath, "follower.log"))) fs.writeFileSync(path.join(logPath, "follower.log"), "", { encoding: "utf-8" });

  return {
    serverLogPath: path.join(logPath, "server.log"),
    leaderLogPath: path.join(logPath, "leader.log"),
    followerLogPath: path.join(logPath, "follower.log"),
  }
}

async function storeSessionsInfo(subject: Subject) {

  const sessions = await Session.findAll(
    {
      where: {
        group_id: subject.session_group_id,
        session_status: "ACTIVE",
      },

      order: [
        ['updated_at', 'DESC']
      ],
      limit: 2
    }
  )

  const [leaderSession, followerSession] = sessions;

  return {
    leaderSessionPath: storeSessionInfo(subject, leaderSession),
    followerSessionPath: storeSessionInfo(subject, followerSession)
  }
}

/**
 * Start a local mirroring sessions including the signaling server and the browsers
 */
export async function startMirroringSessions(experimentInfo: ExperimentInfo) {

  const { serverLogPath, leaderLogPath, followerLogPath } = _createLogPaths();
  const { leaderSessionPath, followerSessionPath } = await storeSessionsInfo(experimentInfo.subject);

  const followerTraceOutputPath = path.join(config.dataPath, "traces", experimentInfo.visitTask.id.toString(), "follower-trace.zip");

  // start the signaling server on a seperate process

  var signalingServer: ChildProcessWithoutNullStreams;
  var follower: ChildProcessWithoutNullStreams;
  var leader: ChildProcessWithoutNullStreams;

  var killed = false;

  async function killProcesses() {
    if (killed) return;

    function _killProcess(process: ChildProcessWithoutNullStreams, name: string): Promise<void> {

      return new Promise<void>((resolve, reject) => {
        if (process?.pid)
          kill(process?.pid, (error) => {
            if (!!error) {
              console.error(error.message);
              console.log(`Gracefully killing ${name} failed. Killing ${name} with SIGKILL`);
              const success = process?.kill("SIGKILL");
              if (!success) {
                console.error(`${name} could not be killed: ${error.message}`);
                reject(`${name} could not be killed`);
              } else {
                resolve();
              }
            }

            resolve();
          });
      });

    }

    await _killProcess(signalingServer, "Signaling Server");
    await _killProcess(leader, "Leader");
    // the follower is killed in the process itself after closing the tracing

    return 0;

  }

  // process.on("beforeExit", killProcesses);
  // process.on("SIGINT", killProcesses);
  // process.on("SIGTERM", killProcesses);
  // process.on("uncaughtException", killProcesses);

  // TODO: 
  // dump interactions to the database 
  // direct stdout and stderr of the process to log files ex: 
  signalingServer = spawn(
    "npx",
    [
      "crawler",
      ...process.argv.slice(2, -2),
      "--",
      `${["internal:server",
        experimentInfo.visitTask.id.toString(), 
        experimentInfo.subject.id.toString(),
      ].join(" ")}`,

    ]
  );

  signalingServer.stdout.pipe(fs.createWriteStream(serverLogPath, { flags: "a" }));
  signalingServer.stderr.pipe(fs.createWriteStream(serverLogPath, { flags: "a" }));

  signalingServer.stderr?.on("data", async (data: any) => {
    console.error(`Signaling Server Error: ${data}`);
    await killProcesses();
  });

  await wait(1000);

  follower = spawn(
    "npx",
    [
      "crawler",
      ...process.argv.slice(2, -2),
      "--",
      `${["internal:follower",
        experimentInfo.visitTask.id.toString(),
        experimentInfo.subject.id.toString(),
        "--storage",
        followerSessionPath,
        "-t",
        followerTraceOutputPath
      ].join(" ")}`,
    ]
  )

  follower.stdout.pipe(fs.createWriteStream(followerLogPath, { flags: "a" }));
  follower.stderr.pipe(fs.createWriteStream(followerLogPath, { flags: "a" }));

  follower.stderr?.on("data", async (data: any) => {
    console.error(`Follower Error: ${data}`);
    // await killProcesses();
  });

  await wait(3000);

  leader = spawn(
    "npx",
    [
      "crawler",
      ...process.argv.slice(2, -2),
      "--",
      `${["internal:leader",
        experimentInfo.visitTask.id.toString(),
        experimentInfo.subject.id.toString(),
        "--storage",
        leaderSessionPath,].join(" ")}`
    ]
  )

  leader.stdout.pipe(fs.createWriteStream(leaderLogPath, { flags: "a" }));
  leader.stderr.pipe(fs.createWriteStream(leaderLogPath, { flags: "a" }));

  leader.stderr?.on("data", async (data: any) => {
    console.error(`Leader Error: ${data}`);
    await killProcesses();
  });

  return killProcesses;
}

/**
 * Connect to a remote mirroring session that is already running
 */

export function connectMirroringSessions(params: {}) {
  throw new Error("Not implemented");
}
