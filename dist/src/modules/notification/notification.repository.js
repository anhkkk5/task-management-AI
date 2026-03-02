"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationRepository = void 0;
const mongoose_1 = require("mongoose");
const notification_model_1 = require("./notification.model");
exports.notificationRepository = {
    // Create notification
    create: async (data) => {
        return notification_model_1.NotificationModel.create(data);
    },
    // Find by ID
    findById: async (id) => {
        return notification_model_1.NotificationModel.findById(id);
    },
    // Find by ID and verify ownership
    findByIdAndUser: async (id, userId) => {
        return notification_model_1.NotificationModel.findOne({ _id: id, userId });
    },
    // List notifications for user with filters
    listForUser: async (userId, options = {}) => {
        const { isRead, type, limit = 20, offset = 0 } = options;
        const query = { userId };
        if (isRead !== undefined)
            query.isRead = isRead;
        if (type)
            query.type = type;
        return notification_model_1.NotificationModel.find(query)
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .lean();
    },
    // Count unread notifications for user
    countUnread: async (userId) => {
        return notification_model_1.NotificationModel.countDocuments({ userId, isRead: false });
    },
    // Mark as read
    markAsRead: async (id, userId) => {
        return notification_model_1.NotificationModel.findOneAndUpdate({ _id: id, userId }, { isRead: true, readAt: new Date() }, { new: true });
    },
    // Mark all as read for user
    markAllAsRead: async (userId) => {
        return notification_model_1.NotificationModel.updateMany({ userId, isRead: false }, { isRead: true, readAt: new Date() });
    },
    // Mark email as sent
    markEmailSent: async (id) => {
        return notification_model_1.NotificationModel.findByIdAndUpdate(id, { emailSent: true, emailSentAt: new Date() }, { new: true });
    },
    // Get pending email notifications
    getPendingEmails: async (limit = 50) => {
        return notification_model_1.NotificationModel.find({
            "channels.email": true,
            emailSent: false,
        })
            .limit(limit)
            .populate("userId", "email fullName")
            .lean();
    },
    // Delete old read notifications (for cleanup)
    deleteOldRead: async (beforeDate) => {
        return notification_model_1.NotificationModel.deleteMany({
            isRead: true,
            readAt: { $lt: beforeDate },
        });
    },
    // Find recent notification by task and type (for duplicate prevention)
    findRecentByTaskAndType: async (taskId, userId, type, since) => {
        return notification_model_1.NotificationModel.findOne({
            userId: new mongoose_1.Types.ObjectId(userId),
            type,
            "data.taskId": taskId,
            createdAt: { $gte: since },
        }).lean();
    },
    // Delete notification (only owner can delete)
    delete: async (id, userId) => {
        const result = await notification_model_1.NotificationModel.deleteOne({
            _id: id,
            userId,
        });
        return result.deletedCount > 0;
    },
};
