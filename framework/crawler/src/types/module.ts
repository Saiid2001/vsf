/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// import Crawler from "../crawler";
// import { Task } from "../crawler/taskqueue";
import { Task } from "./task";

export class Module {
    name: string = "undefined";
    task?: Task;

    constructor() {

    }

    setup = async () => { };

    register = async (task: Task) => {
        this.task = task;
    }
    before = async (page: any) => {
        if (!this.task) return;

    };
    execute = async (page: any) => {

    };
    finish = async (page: any) => {

    };

    clean = async () => { };
}