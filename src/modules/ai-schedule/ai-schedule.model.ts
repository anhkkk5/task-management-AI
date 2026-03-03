import mongoose, { Schema, Types } from "mongoose";

export type ScheduleSession = {
  sessionId: string;
  taskId: string;
  title: string;
  priority: string;
  suggestedTime: string;
  reason: string;
  status: "pending" | "in_progress" | "completed" | "skipped";
  createSubtask?: boolean;
};

export type ScheduleDay = {
  day: string;
  date: string;
  tasks: ScheduleSession[];
  note?: string;
};

export type AIScheduleAttrs = {
  userId?: Types.ObjectId;
  name?: string;
  description?: string;
  schedule: ScheduleDay[];
  suggestedOrder: string[];
  personalizationNote?: string;
  totalEstimatedTime?: string;
  splitStrategy?: string;
  confidenceScore?: number;
  sourceTasks: string[]; // Array of taskIds that were used to generate this schedule
  isActive: boolean;
  appliedAt?: Date;
};

export type AIScheduleDoc = mongoose.Document & {
  userId: Types.ObjectId;
  name?: string;
  description?: string;
  schedule: ScheduleDay[];
  suggestedOrder: string[];
  personalizationNote?: string;
  totalEstimatedTime?: string;
  splitStrategy?: string;
  confidenceScore?: number;
  sourceTasks: string[];
  isActive: boolean;
  appliedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

type AIScheduleModel = mongoose.Model<AIScheduleDoc>;

const scheduleSessionSchema = new Schema<ScheduleSession>(
  {
    sessionId: { type: String, required: true },
    taskId: { type: String, required: true },
    title: { type: String, required: true },
    priority: { type: String, default: "medium" },
    suggestedTime: { type: String, required: true },
    reason: { type: String, default: "" },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed", "skipped"],
      default: "pending",
    },
    createSubtask: { type: Boolean, default: false },
  },
  { _id: false },
);

const scheduleDaySchema = new Schema<ScheduleDay>(
  {
    day: { type: String, required: true },
    date: { type: String, required: true },
    tasks: { type: [scheduleSessionSchema], default: [] },
    note: { type: String },
  },
  { _id: false },
);

const aiScheduleSchema = new Schema<AIScheduleDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    name: { type: String },
    description: { type: String },
    schedule: { type: [scheduleDaySchema], default: [] },
    suggestedOrder: { type: [String], default: [] },
    personalizationNote: { type: String },
    totalEstimatedTime: { type: String },
    splitStrategy: { type: String },
    confidenceScore: { type: Number, min: 0, max: 1 },
    sourceTasks: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    appliedAt: { type: Date },
  },
  { timestamps: true },
);

aiScheduleSchema.index({ userId: 1, isActive: 1, createdAt: -1 });

export const AISchedule =
  (mongoose.models.AISchedule as AIScheduleModel) ||
  mongoose.model<AIScheduleDoc>("AISchedule", aiScheduleSchema);
