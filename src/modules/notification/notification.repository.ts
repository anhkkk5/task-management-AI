import { Types } from "mongoose";
import {
  NotificationModel,
  INotification,
  NotificationType,
} from "./notification.model";

// Helper to exclude snoozed (still pending) + hidden-by-group noti from lists
const visibilityFilter = (now: Date = new Date()) => ({
  $and: [
    {
      $or: [
        { snoozedUntil: { $exists: false } },
        { snoozedUntil: null },
        { snoozedUntil: { $lte: now } },
      ],
    },
    {
      $or: [{ hiddenByGroupId: { $exists: false } }, { hiddenByGroupId: null }],
    },
  ],
});

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
  // By default excludes snoozed + hidden-by-group; use includeSnoozed=true to include all
  listForUser: async (
    userId: Types.ObjectId,
    options: {
      isRead?: boolean;
      type?: NotificationType;
      limit?: number;
      offset?: number;
      includeSnoozed?: boolean;
    } = {},
  ) => {
    const {
      isRead,
      type,
      limit = 20,
      offset = 0,
      includeSnoozed = false,
    } = options;

    const query: any = { userId };
    if (isRead !== undefined) query.isRead = isRead;
    if (type) query.type = type;
    if (!includeSnoozed) {
      Object.assign(query, visibilityFilter());
    }

    return NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();
  },

  // Count unread notifications for user (excludes snoozed/hidden)
  countUnread: async (userId: Types.ObjectId) => {
    return NotificationModel.countDocuments({
      userId,
      isRead: false,
      ...visibilityFilter(),
    });
  },

  // Count notifications for user with filters (excludes snoozed/hidden by default)
  countForUser: async (
    userId: Types.ObjectId,
    options: {
      isRead?: boolean;
      type?: NotificationType;
      includeSnoozed?: boolean;
    } = {},
  ) => {
    const query: any = { userId };
    if (options.isRead !== undefined) query.isRead = options.isRead;
    if (options.type) query.type = options.type;
    if (!options.includeSnoozed) Object.assign(query, visibilityFilter());
    return NotificationModel.countDocuments(query);
  },

  // List snoozed notifications for user (separate tab on FE)
  listSnoozed: async (userId: Types.ObjectId) => {
    return NotificationModel.find({
      userId,
      snoozedUntil: { $gt: new Date() },
    })
      .sort({ snoozedUntil: 1 })
      .lean();
  },

  // Snooze a notification until a specific date
  snooze: async (
    id: string | Types.ObjectId,
    userId: Types.ObjectId,
    until: Date,
  ) => {
    return NotificationModel.findOneAndUpdate(
      { _id: id, userId },
      { snoozedUntil: until },
      { new: true },
    );
  },

  // Unsnooze (clear snoozedUntil)
  unsnooze: async (id: string | Types.ObjectId, userId: Types.ObjectId) => {
    return NotificationModel.findOneAndUpdate(
      { _id: id, userId },
      { $set: { snoozedUntil: null } },
      { new: true },
    );
  },

  // Find notifications whose snooze has expired (cron resurrector)
  findExpiredSnoozes: async (limit: number = 200) => {
    return NotificationModel.find({
      snoozedUntil: { $ne: null, $lte: new Date() },
    })
      .limit(limit)
      .lean();
  },

  clearExpiredSnoozes: async (ids: Types.ObjectId[]) => {
    if (!ids.length) return { modifiedCount: 0 };
    return NotificationModel.updateMany(
      { _id: { $in: ids } },
      { $set: { snoozedUntil: null } },
    );
  },

  // ----- Grouping helpers -----

  // Find unread, non-grouped, non-hidden noti of same type in last windowMinutes for user
  findGroupableSiblings: async (
    userId: Types.ObjectId,
    type: NotificationType,
    windowMinutes: number,
    excludeId?: Types.ObjectId,
  ) => {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const query: any = {
      userId,
      type,
      isRead: false,
      isGroup: { $ne: true },
      createdAt: { $gte: since },
      $or: [{ hiddenByGroupId: { $exists: false } }, { hiddenByGroupId: null }],
    };
    if (excludeId) query._id = { $ne: excludeId };
    return NotificationModel.find(query).sort({ createdAt: -1 }).lean();
  },

  // Find existing group parent (same user + type) within window
  findActiveGroup: async (
    userId: Types.ObjectId,
    type: NotificationType,
    windowMinutes: number,
  ) => {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    return NotificationModel.findOne({
      userId,
      type,
      isGroup: true,
      isRead: false,
      createdAt: { $gte: since },
    });
  },

  // Absorb siblings into a group parent (mark them hidden)
  absorbIntoGroup: async (
    parentId: Types.ObjectId,
    childIds: Types.ObjectId[],
  ) => {
    if (!childIds.length) return { modifiedCount: 0 };
    return NotificationModel.updateMany(
      { _id: { $in: childIds } },
      { $set: { hiddenByGroupId: parentId } },
    );
  },

  // Promote an existing notification to a group parent + attach children
  promoteToGroup: async (
    parentId: Types.ObjectId,
    childIds: Types.ObjectId[],
    newTitle: string,
    newContent: string,
  ) => {
    return NotificationModel.findByIdAndUpdate(
      parentId,
      {
        $set: {
          isGroup: true,
          title: newTitle,
          content: newContent,
          groupCount: childIds.length + 1,
          groupedIds: childIds,
        },
      },
      { new: true },
    );
  },

  // Update existing group parent (append new child)
  appendToGroup: async (
    parentId: Types.ObjectId,
    newChildId: Types.ObjectId,
    newTitle: string,
    newContent: string,
  ) => {
    return NotificationModel.findByIdAndUpdate(
      parentId,
      {
        $set: { title: newTitle, content: newContent },
        $inc: { groupCount: 1 },
        $addToSet: { groupedIds: newChildId },
      },
      { new: true },
    );
  },

  // Fetch group's children (for expand view on FE)
  findGroupChildren: async (parentId: Types.ObjectId) => {
    return NotificationModel.find({ hiddenByGroupId: parentId })
      .sort({ createdAt: -1 })
      .lean();
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

  // Get unread visible notifications since a timestamp (for digest email)
  getUnreadSince: async (
    userId: Types.ObjectId,
    since: Date,
    limit: number = 100,
  ) => {
    return NotificationModel.find({
      userId,
      isRead: false,
      createdAt: { $gte: since },
      ...visibilityFilter(),
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  },

  // Aggregate unread counts by type in window (for digest summary)
  aggregateUnreadByTypeSince: async (userId: Types.ObjectId, since: Date) => {
    return NotificationModel.aggregate([
      {
        $match: {
          userId,
          isRead: false,
          createdAt: { $gte: since },
          ...visibilityFilter(),
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          type: "$_id",
          count: 1,
        },
      },
    ]);
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

  // Delete notifications by taskId and types (used when scheduledTime changes)
  deleteByTaskId: async (
    userId: Types.ObjectId,
    taskId: string,
    types: NotificationType[],
  ) => {
    const result = await NotificationModel.deleteMany({
      userId,
      type: { $in: types },
      "data.taskId": taskId,
    });
    return result.deletedCount || 0;
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
