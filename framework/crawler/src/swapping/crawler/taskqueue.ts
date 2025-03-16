import config from "../../config/index.js";
import { Task } from "../../types/task.js";
import DatabaseHelper from "../../utils/database-helper.js";
import { Logging } from "../../utils/logging.js";

class TaskQueue {
    queue: Task[] = [];
    workerId?: number;

    /**
     * Queue task on the beginning of the task queue
     * @param task 
     */
    enqueue(task: Task) {
        this.queue.unshift(task)
    }

    /**
     * Fetch a task from the task queue. If no task exists, try to load a task from the database and work on that. 
     * - If urlId, domainId, sessionId is set, try to fetch a task for that key
     * - If no task is available, return undefined
     * @param urlId UrlId of task to fetch which it should belong to
     * @param domainId Id of domain to fetch tasks for
     * @param sessionId Id of session to fetch tasks for
     * @returns 
     */
    async dequeue(): Promise<Task | undefined> {
        // Check, whether workerId is specified and if not, return undefined and show warning
        if (!this.workerId) {
            Logging.warn("Tried to fetch new subject without having a registered crawler.")
            return undefined;
        }
        // Check if queue of tasks is empty
        if (this.queue.length === 0) {
            // If queue is empty and crawler is not connected to database, return undefined
            if (config.mode !== "connected") {
                return undefined;
            }
            // If crawler is connected to database, fetch subject from the database
            const tasks = await DatabaseHelper.next(this.workerId);

            // Check if fetching subjects from database yielded any results
            if (tasks) {
                for (let i = 0; i < tasks.length; i++) {
                    const task = tasks[i]
                    // Queue subject as task
                    this.enqueue({ ...task })

                }
            }
        }
        // Retrieve first item from queue and return it
        return this.queue.shift();
    }

    // Check if queue has entries (tasks)
    hasWork() {
        return this.queue.length > 0;
    }
}

export { Task, TaskQueue }