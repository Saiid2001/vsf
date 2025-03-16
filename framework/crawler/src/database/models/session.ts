import {
    Column,
    DataType,
    HasMany,
    Model,
    PrimaryKey,
    AutoIncrement,
    Table,
    BelongsTo,
    ForeignKey,
    AllowNull,
} from "sequelize-typescript";

export enum SessionStatus {
    ACTIVE = "ACTIVE",
    UNLOCKED = "UNLOCKED",
}

@Table({ tableName: "session_groups" })
export class SessionGroup extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;

    @Column(DataType.TEXT)
    site!: string;

    @HasMany(() => Session)
    sessions!: Session[];
}

@Table({ tableName: "sessions", timestamps: true, createdAt: "created_at", updatedAt: "updated_at" })
export class Session extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column(DataType.INTEGER)
    id!: number;

    @Column(DataType.JSON)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session_information!: any;

    @Column(DataType.JSON)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session_data!: any;

    @Column({ type: DataType.ENUM({ values: Object.keys(SessionStatus) }) })
    session_status!: SessionStatus;


    @Column(DataType.JSON)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    additional_information!: any;

    @AllowNull(true)
    @ForeignKey(() => SessionGroup)
    @Column(DataType.INTEGER)
    group_id!: number;

    @BelongsTo(() => SessionGroup)
    group!: SessionGroup;

    @Column(DataType.TEXT)
    experiment!: string;
    
}
