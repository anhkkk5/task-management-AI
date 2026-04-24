import mongoose, { Schema, Types, Document } from "mongoose";

export enum NotificationType {
  TASK_REMINDER = "task_reminder",
  DEADLINE_ALERT = "deadline_alert",
  SCHEDULED_TASK_ALERT = "scheduled_task_alert",
  CHAT_MESSAGE = "chat_message",
  AI_SUGGESTION = "ai_suggestion",
  TEAM_TASK_ASSIGNED = "team_task_assigned",
  TEAM_TASK_STATUS_CHANGED = "team_task_status_changed",
  TEAM_TASK_REASSIGNED = "team_task_reassigned",
  TEAM_TASK_UPDATED = "team_task_updated",
  TEAM_TASK_COMMENT = "team_task_comment",
  TEAM_TASK_MENTION = "team_task_mention",
  SYSTEM = "system",
}

export enum NotificationPriority {
  CRITICAL = "critical",
  HIGH = "high",
  NORMAL = "normal",
  LOW = "low",
}

export interface INotification {
  userId: Types.ObjectId;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  content: string;
  data?: {
    taskId?: Types.ObjectId;
    conversationId?: Types.ObjectId;
    messageId?: Types.ObjectId;
    [key: string]: any;
  };
  isRead: boolean;
  channels: {
    inApp: boolean;
    email: boolean;
    push?: boolean;
  };
  // Snooze: khi có giá trị và > now, notification bị ẩn khỏi list cho tới khi cron resurrect
  snoozedUntil?: Date | null;
  // Grouping
  isGroup?: boolean;
  groupCount?: number;
  groupedIds?: Types.ObjectId[];
  // Nếu set → noti này đã bị gom vào group parent → ẩn khỏi list
  hiddenByGroupId?: Types.ObjectId | null;
  emailSent?: boolean;
  emailSentAt?: Date;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationDoc extends INotification, Document {}

const notificationSchema = new Schema<NotificationDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: true,
    },
    priority: {
      type: String,
      enum: Object.values(NotificationPriority),
      default: NotificationPriority.NORMAL,
      index: true,
    },
    snoozedUntil: {
      type: Date,
      default: null,
      index: true,
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    groupCount: {
      type: Number,
      default: 0,
    },
    groupedIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
    hiddenByGroupId: {
      type: Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    channels: {
      inApp: {
        type: Boolean,
        default: true,
      },
      email: {
        type: Boolean,
        default: false,
      },
      push: {
        type: Boolean,
        default: false,
      },
    },
    emailSent: {
      type: Boolean,
      default: false,
    },
    emailSentAt: {
      type: Date,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    collection: "notifications",
  },
);

// Indexes for query optimization
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ "data.taskId": 1 });
notificationSchema.index({ "data.conversationId": 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ emailSent: 1, "channels.email": 1 });
notificationSchema.index({ userId: 1, type: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ snoozedUntil: 1 });

export const NotificationModel = mongoose.model<NotificationDoc>(
  "Notification",
  notificationSchema,
);
