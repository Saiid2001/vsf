import {
  AutoIncrement,
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
import { SessionGroup } from "./session.js";
import { Url } from "./url.js";
import { Worker } from "./worker.js";
import { Domain } from "./domain.js";

// export enum SubjectStatus {
//   UNVISITED = "UNVISITED",
//   PROCESSING = "PROCESSING",
//   VISITED = "VISITED",
//   SKIP = "SKIP",
//   FAILED = "FAILED",
// }

export enum SubjectType {
  MIRROR = "MIRROR",
  SWAP = "SWAP",
}

@Table({ tableName: "subjects", timestamps: true, createdAt: "created_at", updatedAt: "updated_at" })
export class Subject extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id!: number;

  @Default(SubjectType.MIRROR)
  @Column({ type: DataType.ENUM({ values: Object.keys(SubjectType) }) })
  type!: SubjectType;

  @Column(DataType.TEXT)
  start_url!: string;

  @Column(DataType.TEXT)
  final_url!: string;

  // @Index
  // @Default(SubjectStatus.UNVISITED)
  // @Column({ type: DataType.ENUM({ values: Object.keys(SubjectStatus) }) })
  // status!: SubjectStatus;

  @Column(DataType.JSON)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  additional_information!: any;

  @Column(DataType.DATE)
  visitation_begin!: Date

  @Column(DataType.DATE)
  visitation_end!: Date

  @BelongsTo(() => Url)
  url!: Url;

  @Index
  @ForeignKey(() => Url)
  @Column(DataType.INTEGER)
  url_id!: number;

  @BelongsTo(() => Domain)
  domain!: Domain;

  @Index
  @ForeignKey(() => Domain)
  @Column(DataType.INTEGER)
  domain_id!: number;

  @BelongsTo(() => SessionGroup)
  session_group!: SessionGroup;

  @Index
  @ForeignKey(() => SessionGroup)
  @Column(DataType.INTEGER)
  session_group_id!: number;

  @Index
  @ForeignKey(() => Worker)
  @Column(DataType.INTEGER)
  worker!: number;
}
