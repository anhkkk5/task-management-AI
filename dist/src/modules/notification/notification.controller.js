"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationController = void 0;
const notification_service_1 = require("./notification.service");
exports.notificationController = {
    // List notifications for current user
    list: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const isRead = req.query.isRead === "true"
                ? true
                : req.query.isRead === "false"
                    ? false
                    : undefined;
            const type = req.query.type;
            const limit = parseInt(req.query.limit) || 20;
            const offset = parseInt(req.query.offset) || 0;
            const notifications = await notification_service_1.notificationService.list(userId, {
                isRead,
                type,
                limit,
                offset,
            });
            const unreadCount = await notification_service_1.notificationService.countUnread(userId);
            res.status(200).json({ notifications, unreadCount });
        }
        catch (err) {
            res.status(500).json({ message: "Failed to list notifications" });
        }
    },
    // Mark notification as read
    markAsRead: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const { id } = req.params;
            const notification = await notification_service_1.notificationService.markAsRead(String(id), userId);
            if (!notification) {
                res.status(404).json({ message: "Notification not found" });
                return;
            }
            res.status(200).json({ notification });
        }
        catch (err) {
            res.status(500).json({ message: "Failed to mark notification as read" });
        }
    },
    // Mark all notifications as read
    markAllAsRead: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            await notification_service_1.notificationService.markAllAsRead(userId);
            res.status(200).json({ message: "All notifications marked as read" });
        }
        catch (err) {
            res.status(500).json({ message: "Failed to mark notifications as read" });
        }
    },
    // Delete notification
    delete: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const { id } = req.params;
            const deleted = await notification_service_1.notificationService.delete(String(id), userId);
            if (!deleted) {
                res.status(404).json({ message: "Notification not found" });
                return;
            }
            res.status(200).json({ message: "Notification deleted" });
        }
        catch (err) {
            res.status(500).json({ message: "Failed to delete notification" });
        }
    },
};
