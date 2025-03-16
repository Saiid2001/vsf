import { confirm, select, input } from "@inquirer/prompts";
import { resetDataForSubject } from "./browsers.js";
import { sequelize } from "../database/db.js";
import { SessionGroup, Session } from "../database/models/session.js";
import { Subject } from "../database/models/subject.js";
import { startMirroringSessions } from "./sessions.js";
import { DefaultTaskStatus, DefaultVisitTaskResult, PreanalysisTask, TaskStatus, TaskType, VisitTask, VisitTaskResult } from "../database/models/tasks.js";

async function tryGetTaskToProcess() {
    const task = await VisitTask.findOne({
        where: {
            status_name: DefaultTaskStatus.FREE
        },

        include: [
            {
                model: Subject,
                include: [SessionGroup]
            }
        ]
    })

    task?.update({ status_name: DefaultTaskStatus.SELECTED });

    return task;
}

async function freeTask(task: VisitTask) {

    await task?.update({ status_name: DefaultTaskStatus.FREE });

}

async function handleFailedTask(task: VisitTask) {

    // if the task accounts are not logged in, refetch sessions for the task again
    if (task.result_name == "mnl") {
        // create a copy of the task
        const newTask = await VisitTask.create({
            subject_id: task.subject_id,
            status_name: DefaultTaskStatus.PREPARING
        })
    }

    // handle errors in framework
    else if (task.result_name == "mer") {
        // create a copy of the task
        const newTask = await VisitTask.create({
            subject_id: task.subject_id,
            status_name: DefaultTaskStatus.PREPARING
        })
    }


}

async function resetSubject(subject: Subject) {

    // get all reports associated with this subject and remove them

    await resetDataForSubject(subject);

    return await subject.update({
        // status: SubjectStatus.UNVISITED,
        visitation_begin: null,
        visitation_end: null,
        additional_information: null,
    })
}

async function disposeLiveTasks(subject: Subject) {
    // preanalysis tasks
    const preanalysisTask = await PreanalysisTask.findOne({
        where: {
            subject_id: subject.id,
            task_type: TaskType.AUTOMATIC,
            is_live: true
        }
    })

    if (preanalysisTask) {
        await preanalysisTask.update({
            note: JSON.stringify({
                "todo": "dispose"
            })
        })
    }
}

async function processTask(task: VisitTask, actorName: string, isLive: boolean = false) {

    try {

        if (isLive) {
            // create a preanalysis task for the subject
            await PreanalysisTask.create({
                task_type: TaskType.AUTOMATIC,
                subject_id: task.subject_id,
                is_live: true
            })
        }

        // Update the subject status to processing
        task = await task.update({
            status_name: DefaultTaskStatus.PROCESSING,
            actor: actorName
        })

        await task.subject.update({
            visitation_begin: new Date()
        })

        const stopMirroringSessions = await startMirroringSessions({
            visitTask: task,
            subject: task.subject,
        })

        // Wait for the user to press enter
        const opt = await select({
            message: 'Choose one of the following keys to manage the experiment',
            choices: [
                {
                    name: 'Restart',
                    value: 'r',
                    description: 'Restart the experiment and delete the recorded data for this subject.',
                },
                {
                    name: 'Stop',
                    value: 'x',
                    description: 'Stop the experiment.',
                }
            ],
        });

        switch (opt) {
            case 'r':
                console.log("Restarting the experiment.");
                await stopMirroringSessions();
                if (isLive) await disposeLiveTasks(task.subject);
                await resetDataForSubject(task.subject);
                return processTask(task, actorName, isLive);
            case 'x':
                console.log("Stopping the experiment.");
                break;
        }

        await stopMirroringSessions();

        const visitResult = await select({
            message: "Was the visit successfull?",
            choices: (await VisitTaskResult.findAll()).map((r) => ({
                name: r.note,
                value: r
            }))
        });

        if (visitResult.success) {

            // Update the subject status to visited
            await task.update({
                status_name: DefaultTaskStatus.COMPLETED,
                result_name: visitResult.name
            })

            await task.subject.update({
                visitation_end: new Date(),
            })

            if (!isLive) {
                // create a preanalysis task for the subject
                await PreanalysisTask.create({
                    task_type: TaskType.AUTOMATIC,
                    subject_id: task.subject_id,
                })
            }

        }
        else {

            const failureDetail = await input({ message: "Additional comments about the failure reason:" });

            const tryAgain = await confirm({ message: "Do you want to repeat the subject later?", default: false });

            if (tryAgain) {
                await resetSubject(task.subject);
                await freeTask(task);
                return 0;
            }

            await task.update({
                status_name: DefaultTaskStatus.COMPLETED,
                result_name: visitResult.name,
                note: failureDetail
            })

            await task.subject.update({
                visitation_end: new Date(),
            })

            if (isLive) await disposeLiveTasks(task.subject);

            await handleFailedTask(task);

        }

        return 0;

    } catch (e: any) {


        task = await task.update({
            status_name: DefaultTaskStatus.COMPLETED,
            result_name: DefaultVisitTaskResult.ERROR,
            note: e.toString()

        })

        console.error(e);
        return 1;
    }

}

async function updateFreeTasks() {
    // check if the free tasks have active sessions
    const freeTasks = await VisitTask.findAll({
        where: {
            status_name: DefaultTaskStatus.FREE
        },
        include: [
            Subject,
        ]
    })

    for (const task of freeTasks) {

        const activeSessions = await Session.count({
            where: {
                group_id: task.subject.session_group_id,
                session_status: "ACTIVE"
            }
        })

        if (activeSessions < 2) {
            await task.update({
                status_name: DefaultTaskStatus.PREPARING
            })
        }
    }
}

export async function startManualWorkSession(options: { live?: boolean }) {

    console.log(`
    Welcome to the manual work session.
    In this session, you can manually process subjects.
    `);

    if (options.live) {
        console.log("LIVE MODE: The subjects will be processed in live mode.");
    }

    // update the status of all tasks that are free
    await updateFreeTasks();

    // enter the actor name
    const actorName = await input({ message: "Enter the actor name:" });

    await sequelize.sync();

    let task: VisitTask | null = await tryGetTaskToProcess();

    while (task) {

        if (! await confirm({ message: `Do you want to process subject ${task.subject.id}: ${task.subject.start_url}?` })) {
            console.log("Stopping manual work session.");
            await freeTask(task);
            return;
        }

        const error = await processTask(task, actorName, options.live);

        task = await tryGetTaskToProcess();

    }

    if (!task)
        console.log("No more subjects to process. Exiting manual work session.");

}