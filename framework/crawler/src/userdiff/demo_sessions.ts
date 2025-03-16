import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { SignalingServer } from "playwright-mirror";
import kill from "tree-kill";
import { wait } from "../utils/misc.js";

export async function startMirroringSessions() {

    // start the signaling server on a seperate process
  
    var signalingServer: ChildProcessWithoutNullStreams;
    var follower: ChildProcessWithoutNullStreams;
    var leader: ChildProcessWithoutNullStreams;
  
    var killed = false;
    function killProcesses() {
      if (killed) return;
  
      console.log("Gracefully Killing processes", signalingServer?.pid, follower?.pid, leader?.pid);
    
      const success1 = signalingServer.pid? kill(signalingServer?.pid): true;
      if (!success1) {
        console.log("Gracefully killing signaling server failed. Killing signaling server with SIGKILL");
        signalingServer?.kill("SIGKILL");
      }
  
      const success2 = follower.pid? kill(follower?.pid): true;
      if (!success2) {
        console.log("Gracefully killing follower failed. Killing follower with SIGKILL");
        follower?.kill("SIGKILL");
      }
      const success3 = leader.pid? kill(leader?.pid): true;
      if (!success3) {
        console.log("Gracefully killing leader failed. Killing leader with SIGKILL");
        leader?.kill("SIGKILL");
      }
  
      killed = true;
    }
  
    process.on("beforeExit", killProcesses);
    process.on("SIGINT", killProcesses);
    process.on("SIGTERM", killProcesses);
    process.on("uncaughtException", killProcesses);
  
    // TODO: 
    // dump interactions to the database
    signalingServer = SignalingServer.spawnProcess({});
  
    await wait(1000);
  
    follower = spawn(
      "npx", 
      [
        "crawler", 
        ...process.argv.slice(2, -2),
        "--",
        `${["internal:follower",
        "1",
        "--storage", 
        "/misc/session-a.json"].join(" ")}`
      ]
    )
  
    console.log(follower.spawnargs.join(" "))
  
    follower.stdout?.on("data", (data: any) => {
      console.log(`Follower: ${data}`);
    });
  
    follower.stderr?.on("data", (data: any) => {
      console.error(`Follower: ${data}`);
    });
  
    await wait(1000);
  
    leader = spawn(
      "npx", 
      [
        "crawler", 
        ...process.argv.slice(2, -2),
        "--",
        `${["internal:leader",
        "1",
        "--storage", 
        "/misc/session-b.json"].join(" ")}`
      ]
    ) 
  
    console.log(leader.spawnargs.join(" "))
  
    leader.stdout?.on("data", (data: any) => {
      console.log(`Leader: ${data}`);
    });
  
    leader.stderr?.on("data", (data: any) => {
      console.error(`Leader: ${data}`);
    });
  
    return killProcesses;
  }

startMirroringSessions();