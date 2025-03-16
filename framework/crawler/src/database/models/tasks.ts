import {
    AllowNull,
    AutoIncrement,
    BeforeSave,
    BelongsTo,
    Column,
    DataType,
    Default,
    ForeignKey,
    Index,
    Model,
    PrimaryKey,
    Table,
} from "sequelize-typescript";
import { Subject } from "./subject.js";
import { Session } from "./session.js";
import { Worker } from "./worker.js";


export class Result extends Model {

    @PrimaryKey
    @Column(DataType.TEXT)
    name!: string;

    @Column(DataType.BOOLEAN)
    success!: boolean;

    @Column(DataType.TEXT)
    note!: string;

}

export class Status extends Model {

    @PrimaryKey
    @Column(DataType.TEXT)
    name!: string;

    @Column(DataType.BOOLEAN)
    active!: boolean;

    @Column(DataType.TEXT)
    note!: string;
}

export enum TaskType {
    MANUAL = "manual",
    AUTOMATIC = "auto",
}

export enum DefaultTaskStatus {
    FREE = 'free',
    SELECTED = 'selected',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    PREPARING = 'preparing'
}


@Table({ tableName: "task_statuses", timestamps: false })
export class TaskStatus extends Status { }


export class Task extends Model {

    @AllowNull(true)
    @Column(DataType.TEXT)
    actor!: string;

    @Default("free")
    @ForeignKey(() => TaskStatus)
    @Column(DataType.TEXT)
    status_name!: string;

    @BelongsTo(() => TaskStatus)
    status!: TaskStatus;

    @Default(TaskType.MANUAL)
    @Column(DataType.TEXT)
    task_type!: string;

    @Default("")
    @Column(DataType.TEXT)
    note!: string;
}

@Table({ tableName: "visit_task_results", timestamps: false })
export class VisitTaskResult extends Result { }

export enum DefaultVisitTaskResult {
    ERROR = "mpe"
}

@Table({ tableName: "visit_tasks", timestamps: true, createdAt: "created_at", updatedAt: "updated_at" })
export class VisitTask extends Task {

    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;

    @ForeignKey(() => Subject)
    @Column(DataType.INTEGER)
    subject_id!: number;

    @AllowNull(true)
    @ForeignKey(() => VisitTaskResult)
    @Column(DataType.TEXT)
    result_name!: string;

    @BelongsTo(() => Subject)
    subject!: Subject;

    @BelongsTo(() => VisitTaskResult, { foreignKey: "result_name" })
    result!: VisitTaskResult;

}

@Table({ tableName: "preanalysis_task_results", timestamps: false })
export class PreanalysisTaskResult extends Result { }

@Table({ tableName: "preanalysis_tasks", timestamps: true, createdAt: "created_at", updatedAt: "updated_at" })
export class PreanalysisTask extends Task {

    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;

    @ForeignKey(() => Subject)
    @Column(DataType.INTEGER)
    subject_id!: number;

    @BelongsTo(() => Subject)
    subject!: Subject;

    @AllowNull(true)
    @ForeignKey(() => PreanalysisTaskResult)
    @Column(DataType.TEXT)
    result_name!: string;

    @BelongsTo(() => PreanalysisTaskResult, { foreignKey: "result_name" })
    result!: PreanalysisTaskResult;

    @Default(false)
    @Column(DataType.BOOLEAN)
    is_live!: boolean;

}

@Table({ tableName: "analysis_task_results", timestamps: false })
export class AnalysisTaskResult extends Result { }

@Table({ tableName: "analysis_tasks", timestamps: true, createdAt: "created_at", updatedAt: "updated_at" })
export class AnalysisTask extends Task {

    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;

    @ForeignKey(() => Subject)
    @Column(DataType.INTEGER)
    subject_id!: number;

    @BelongsTo(() => Subject)
    subject!: Subject;

    @AllowNull(true)
    @ForeignKey(() => AnalysisTaskResult)
    @Column(DataType.TEXT)
    result_name!: string;

    @BelongsTo(() => AnalysisTaskResult, { foreignKey: "result_name" })
    result!: AnalysisTaskResult;

    @Default(false)
    @Column(DataType.BOOLEAN)
    is_live!: boolean;

}

@Table({ tableName: "analysis_candidate_pairs_results", timestamps: false })
export class AnalysisCandidatePairResult extends Result { }

@Table({ tableName: "analysis_candidate_pairs", timestamps: false })
export class AnalysisCandidatePair extends Model {

    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;

    @Column(DataType.INTEGER)
    response_1_id!: number;

    @Column(DataType.INTEGER)
    response_2_id!: number;

    @Column(DataType.TEXT)
    note!: string;

    @Column(DataType.JSON)
    additional_information!: any;

    @Column(DataType.JSON)
    swappable_keys!: any;

    @ForeignKey(() => AnalysisTask)
    @Column(DataType.INTEGER)
    task_id!: number;

    @BelongsTo(() => AnalysisTask)
    task!: AnalysisTask;

    @AllowNull(true)
    @ForeignKey(() => AnalysisCandidatePairResult)
    @Column(DataType.TEXT)
    result_name!: string;

    @BelongsTo(() => AnalysisCandidatePairResult)
    result!: AnalysisCandidatePairResult;

}

export enum DefaultSwapTaskStatus {
    FREE = 'free',
    SELECTED = 'selected',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    PREPARING = 'preparing',
    WAITING_SESSION = 'waiting_session'
}

@Table({ tableName: "swap_task_results", timestamps: false })
export class SwapTaskResult extends Result { }

@Table({ tableName: "swap_tasks", timestamps: true, createdAt: "created_at", updatedAt: "updated_at" })
export class SwapTask extends Task {

    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;

    @ForeignKey(() => Subject)
    @Column(DataType.INTEGER)
    subject_id!: number;

    @BelongsTo(() => Subject)
    subject!: Subject;

    @AllowNull(true)
    @ForeignKey(() => SwapTaskResult)
    @Column(DataType.TEXT)
    result_name!: string;

    @BelongsTo(() => SwapTaskResult, { foreignKey: "result_name" })
    result!: SwapTaskResult;

    @Column(DataType.DATE)
    visitation_begin!: Date

    @Column(DataType.DATE)
    visitation_end!: Date

    @AllowNull(true)
    @ForeignKey(() => Session)
    @Column(DataType.INTEGER)
    session_id!: number;

    @BelongsTo(() => Session)
    session!: Session;

    @ForeignKey(() => Worker)
    @Column(DataType.INTEGER)
    worker_id!: number;

    @BelongsTo(() => Worker)
    worker!: Worker;

    @Default(false)
    @Column(DataType.BOOLEAN)
    is_live!: boolean;

}

@Table({ tableName: "swap_candidate_pairs", timestamps: false })
export class SwapCandidate extends Model {

    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;

    @ForeignKey(() => AnalysisCandidatePair)
    @Column(DataType.INTEGER)
    candidate_pair_id!: number;

    @BelongsTo(() => AnalysisCandidatePair)
    candidate_pair!: AnalysisCandidatePair;

    @ForeignKey(() => SwapTask)
    @Column(DataType.INTEGER)
    task_id!: number;

    @BelongsTo(() => SwapTask)
    task!: SwapTask;

    @Column(DataType.JSON)
    swap_request_representation!: any;

    @Column(DataType.TEXT)
    representation_hash!: string;

    @AllowNull(true)
    @Column(DataType.JSON)
    interest_variables!: any;

    @Default(DefaultSwapTaskStatus.FREE)
    @Column(DataType.TEXT)
    state!: string;

    @AllowNull(true)
    @Column(DataType.TEXT)
    error!: string;

    @AllowNull(true)
    @Column(DataType.TEXT)
    error_stack!: string;

}
