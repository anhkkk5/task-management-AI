import { Types } from "mongoose";
import {
  NotificationModel,
  INotification,
  NotificationType,
} from "./notification.model";

export const notificationRepository = {
  // Create notification
  create: async (data: Omit<INotification, "createdAt" | "updatedAt">) => {
    return NotificationModel.create(data);
  },

  // Find by ID
  findById: async (id: string | Types.ObjectId) => {
    return NotificationModel.findById(id);
  },

  // Find by ID and verify ownership
  findByIdAndUser: async (
    id: string | Types.ObjectId,
    userId: Types.ObjectId,
  ) => {
    return NotificationModel.findOne({ _id: id, userId });
  },

  // List notifications for user with filters
  listForUser: async (
    userId: Types.ObjectId,
    options: {
      isRead?: boolean;
      type?: NotificationType;
      limit?: number;
      offset?: number;
    } = {},
  ) => {
    const { isRead, type, limit = 20, offset = 0 } = options;

    const query: any = { userId };
    if (isRead !== undefined) query.isRead = isRead;
    if (type) query.type = type;

    return NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();
  },

  // Count unread notifications for user
  countUnread: async (userId: Types.ObjectId) => {
    return NotificationModel.countDocuments({ userId, isRead: false });
  },

  // Mark as read
  markAsRead: async (id: string | Types.ObjectId, userId: Types.ObjectId) => {
    return NotificationModel.findOneAndUpdate(
      { _id: id, userId },
      { isRead: true, readAt: new Date() },
      { new: true },
    );
  },

  // Mark all as read for user
  markAllAsRead: async (userId: Types.ObjectId) => {
    return NotificationModel.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  },

  // Mark email as sent
  markEmailSent: async (id: string | Types.ObjectId) => {
    return NotificationModel.findByIdAndUpdate(
      id,
      { emailSent: true, emailSentAt: new Date() },
      { new: true },
    );
  },

  // Get pending email notifications
  getPendingEmails: async (limit: number = 50) => {
    return NotificationModel.find({
      "channels.email": true,
      emailSent: false,
    })
      .limit(limit)
      .populate("userId", "email fullName")
      .lean();
  },

  // Delete old read notifications (for cleanup)
  deleteOldRead: async (beforeDate: Date) => {
    return NotificationModel.deleteMany({
      isRead: true,
      readAt: { $lt: beforeDate },
    });
  },

  // Find recent notification by task and type (for duplicate prevention)
  findRecentByTaskAndType: async (
    taskId: string,
    userId: string,
    type: NotificationType,
    since: Date,
  ) => {
    return NotificationModel.findOne({
      userId: new Types.ObjectId(userId),
      type,
      "data.taskId": taskId,
      createdAt: { $gte: since },
    }).lean();
  },

  // Delete notification (only owner can delete)
  delete: async (id: string | Types.ObjectId, userId: Types.ObjectId) => {
    const result = await NotificationModel.deleteOne({
      _id: id,
      userId,
    });
    return result.deletedCount > 0;
  },
};
