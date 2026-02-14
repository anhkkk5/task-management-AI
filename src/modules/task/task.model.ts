import mongoose, { Schema, Types } from "mongoose";
import { TaskPriority, TaskStatus } from "./task.dto";

export type TaskAttrs = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  deadline?: Date;
  tags?: string[];
  userId: Types.ObjectId;
  aiBreakdown?: { title: string; status?: TaskStatus }[];
  reminderAt?: Date;
};

export type TaskDoc = mongoose.Document & {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline?: Date;
  tags: string[];
  userId: Types.ObjectId;
  aiBreakdown: { title: string; status: TaskStatus }[];
  reminderAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

type TaskModel = mongoose.Model<TaskDoc>;

const taskSchema = new Schema<TaskDoc>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String },
    status: {
      type: String,
      enum: ["todo", "in_progress", "completed", "cancelled"],
      default: "todo",
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      index: true,
    },
    deadline: { type: Date, index: true },
    tags: { type: [String], default: [] },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    aiBreakdown: {
      type: [
        {
          title: { type: String, required: true },
          status: {
            type: String,
            enum: ["todo", "in_progress", "completed", "cancelled"],
            default: "todo",
          },
        },
      ],
      default: [],
    },
    reminderAt: { type: Date },
  },
  { timestamps: true },
);

taskSchema.index({ userId: 1, status: 1, deadline: 1, priority: 1 });

export const Task =
  (mongoose.models.Task as TaskModel) ||
  mongoose.model<TaskDoc>("Task", taskSchema);
