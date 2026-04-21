import mongoose, { Schema, Types } from "mongoose";
import { TaskPriority, TaskStatus } from "./task.dto";

/**
 * Guest summary information embedded in Task/Event
 * Contains essential guest details for quick access without separate database queries
 */
export type GuestSummary = {
  guestId: Types.ObjectId; // Reference to Guest document
  email: string;
  name: string;
  avatar?: string; // URL to avatar image
  permission: "edit_event" | "view_guest_list" | "invite_others";
  status?: "pending" | "accepted" | "declined";
};

export type TaskAttrs = {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  deadline?: Date;
  tags?: string[];
  type?: "event" | "todo" | "appointment";
  allDay?: boolean;
  guests?: string[]; // Legacy: simple email strings
  guestDetails?: GuestSummary[]; // New: detailed guest information with permissions
  location?: string;
  visibility?: "default" | "public" | "private";
  reminderMinutes?: number;
  recurrence?: string;
  meetingLink?: string;
  userId: Types.ObjectId;
  parentTaskId?: Types.ObjectId;
  aiBreakdown?: {
    title: string;
    status?: TaskStatus;
    estimatedDuration?: number;
    difficulty?: "easy" | "medium" | "hard";
    description?: string;
    scheduledDate?: string;
    scheduledTime?: string;
  }[];
  dailyTargetDuration?: number; // Mục tiêu phút/ngày (max)
  dailyTargetMin?: number; // Mục tiêu tối thiểu phút/ngày
  estimatedDuration?: number; // Phút dự kiến hoàn thành
  reminderAt?: Date;
  scheduledTime?: {
    start: Date;
    end: Date;
    aiPlanned: boolean;
    reason?: string;
  };
  isArchived?: boolean;
  teamAssignment?: {
    teamId: Types.ObjectId;
    assigneeId: Types.ObjectId;
    assigneeEmail: string;
    assigneeName: string;
    assignedBy: Types.ObjectId;
    assignedAt: Date;
    startAt?: Date;
  };
};

export type TaskDoc = mongoose.Document & {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline?: Date;
  tags: string[];
  type?: "event" | "todo" | "appointment";
  allDay?: boolean;
  guests: string[]; // Legacy: simple email strings
  guestDetails: GuestSummary[]; // New: detailed guest information with permissions
  location?: string;
  visibility: "default" | "public" | "private";
  reminderMinutes?: number;
  recurrence?: string;
  meetingLink?: string;
  userId: Types.ObjectId;
  parentTaskId?: Types.ObjectId;
  aiBreakdown: {
    title: string;
    status: TaskStatus;
    estimatedDuration?: number;
    difficulty?: "easy" | "medium" | "hard";
    description?: string;
    scheduledDate?: string;
    scheduledTime?: string;
  }[];
  dailyTargetDuration?: number; // Mục tiêu phút/ngày (max)
  dailyTargetMin?: number; // Mục tiêu tối thiểu phút/ngày
  estimatedDuration?: number; // Phút dự kiến hoàn thành
  reminderAt?: Date;
  scheduledTime?: {
    start: Date;
    end: Date;
    aiPlanned: boolean;
    reason?: string;
  };
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  teamAssignment?: {
    teamId: Types.ObjectId;
    assigneeId: Types.ObjectId;
    assigneeEmail: string;
    assigneeName: string;
    assignedBy: Types.ObjectId;
    assignedAt: Date;
    startAt?: Date;
  };
};

type TaskModel = mongoose.Model<TaskDoc>;

const taskSchema = new Schema<TaskDoc>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String },
    type: {
      type: String,
      enum: ["event", "todo", "appointment"],
      default: "todo",
      index: true,
    },
    allDay: { type: Boolean, default: false },
    guests: { type: [String], default: [] },
    /**
     * Detailed guest information with permissions and status
     * Stores guest summary data for quick access without separate queries
     * Each guest includes: guestId, email, name, avatar, permission, status
     * Maintains backward compatibility with legacy guests array
     */
    guestDetails: {
      type: [
        {
          guestId: {
            type: Schema.Types.ObjectId,
            ref: "Guest",
            required: true,
          },
          email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
          },
          name: {
            type: String,
            required: true,
            trim: true,
          },
          avatar: {
            type: String,
            default: null,
          },
          permission: {
            type: String,
            enum: ["edit_event", "view_guest_list", "invite_others"],
            default: "view_guest_list",
          },
          status: {
            type: String,
            enum: ["pending", "accepted", "declined"],
            default: "pending",
          },
        },
      ],
      default: [],
    },
    location: { type: String, trim: true },
    visibility: {
      type: String,
      enum: ["default", "public", "private"],
      default: "default",
      index: true,
    },
    reminderMinutes: { type: Number, min: 0 },
    recurrence: { type: String },
    meetingLink: { type: String },
    status: {
      type: String,
      enum: ["todo", "scheduled", "in_progress", "completed", "cancelled"],
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
    parentTaskId: { type: Schema.Types.ObjectId, index: true },
    aiBreakdown: {
      type: [
        {
          title: { type: String, required: true },
          status: {
            type: String,
            enum: ["todo", "in_progress", "completed", "cancelled"],
            default: "todo",
          },
          estimatedDuration: { type: Number, min: 0 }, // Phút
          difficulty: {
            type: String,
            enum: ["easy", "medium", "hard"],
          },
          description: { type: String },
        },
      ],
      default: [],
    },
    dailyTargetDuration: { type: Number, min: 0 }, // Mục tiêu phút/ngày (max)
    dailyTargetMin: { type: Number, min: 0 }, // Mục tiêu tối thiểu phút/ngày
    estimatedDuration: { type: Number, min: 0 }, // Phút dự kiến
    reminderAt: { type: Date },
    scheduledTime: {
      start: { type: Date },
      end: { type: Date },
      aiPlanned: { type: Boolean, default: false },
      reason: { type: String },
    },
    isArchived: { type: Boolean, default: false, index: true },
    teamAssignment: {
      teamId: { type: Schema.Types.ObjectId, index: true },
      assigneeId: { type: Schema.Types.ObjectId, index: true },
      assigneeEmail: { type: String },
      assigneeName: { type: String },
      assignedBy: { type: Schema.Types.ObjectId },
      assignedAt: { type: Date },
      startAt: { type: Date },
    },
  },
  { timestamps: true },
);

taskSchema.index({ userId: 1, status: 1, deadline: 1, priority: 1 });

export const Task =
  (mongoose.models.Task as TaskModel) ||
  mongoose.model<TaskDoc>("Task", taskSchema);
