import mongoose, { Schema, Types, Document } from "mongoose";

export enum NotificationType {
  TASK_REMINDER = "task_reminder",
  DEADLINE_ALERT = "deadline_alert",
  CHAT_MESSAGE = "chat_message",
  AI_SUGGESTION = "ai_suggestion",
  SYSTEM = "system",
}

export interface INotification {
  userId: Types.ObjectId;
  type: NotificationType;
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

export const NotificationModel = mongoose.model<NotificationDoc>(
  "Notification",
  notificationSchema,
);
