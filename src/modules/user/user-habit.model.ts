import mongoose, { Model, Schema, Types } from "mongoose";

export type UserHabitAttrs = {
  userId: Types.ObjectId;
  productiveHours?: { start: number; end: number }[]; // Giờ làm việc hiệu quả (0-23)
  preferredBreakDuration?: number; // Phút nghỉ giữa task
  maxFocusDuration?: number; // Phút tối đa focus liên tục
  preferredWorkPattern?: "morning" | "afternoon" | "evening" | "mixed";
  taskCompletionHistory?: {
    hour: number;
    dayOfWeek: number;
    completed: boolean;
    duration: number;
  }[];
  aiPreferences?: {
    autoBreakdown: boolean;
    autoSchedule: boolean;
    prioritizeDeadline: boolean;
    bufferBetweenTasks: number; // Phút buffer
  };
};

export type UserHabitDoc = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  productiveHours: { start: number; end: number }[];
  preferredBreakDuration: number;
  maxFocusDuration: number;
  preferredWorkPattern: string;
  taskCompletionHistory: {
    hour: number;
    dayOfWeek: number;
    completed: boolean;
    duration: number;
    date: Date;
  }[];
  aiPreferences: {
    autoBreakdown: boolean;
    autoSchedule: boolean;
    prioritizeDeadline: boolean;
    bufferBetweenTasks: number;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type UserHabitModel = Model<UserHabitDoc>;

const userHabitSchema = new Schema<UserHabitDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
      ref: "User",
    },
    productiveHours: [
      {
        start: { type: Number, min: 0, max: 23 },
        end: { type: Number, min: 0, max: 23 },
      },
    ],
    preferredBreakDuration: {
      type: Number,
      default: 15, // 15 phút
      min: 0,
      max: 120,
    },
    maxFocusDuration: {
      type: Number,
      default: 90, // 90 phút
      min: 15,
      max: 240,
    },
    preferredWorkPattern: {
      type: String,
      enum: ["morning", "afternoon", "evening", "mixed"],
      default: "mixed",
    },
    taskCompletionHistory: [
      {
        hour: { type: Number, min: 0, max: 23 },
        dayOfWeek: { type: Number, min: 0, max: 6 },
        completed: { type: Boolean },
        duration: { type: Number }, // Phút
        date: { type: Date },
      },
    ],
    aiPreferences: {
      autoBreakdown: { type: Boolean, default: true },
      autoSchedule: { type: Boolean, default: true },
      prioritizeDeadline: { type: Boolean, default: true },
      bufferBetweenTasks: { type: Number, default: 15 },
    },
  },
  {
    timestamps: true,
  },
);

export const UserHabit =
  (mongoose.models.UserHabit as UserHabitModel) ||
  mongoose.model<UserHabitDoc>("UserHabit", userHabitSchema);
