"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationController = void 0;
const notification_service_1 = require("./notification.service");
const notification_repository_1 = require("./notification.repository");
const mongoose_1 = require("mongoose");
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
            const total = await notification_repository_1.notificationRepository.countForUser(new mongoose_1.Types.ObjectId(userId), { isRead, type });
            res.status(200).json({ items: notifications, total, unreadCount });
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
    // Snooze a notification → accepts { duration?: "15min"|"1hour"|"3hour"|"tomorrow", minutes?: number }
    snooze: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const { id } = req.params;
            const { duration, minutes } = req.body || {};
            let arg = duration;
            if (!arg && typeof minutes === "number")
                arg = minutes;
            if (!arg) {
                res.status(400).json({
                    message: "Thiếu tham số duration hoặc minutes (ví dụ: '15min', '1hour', 'tomorrow', hoặc số phút)",
                });
                return;
            }
            const allowedTokens = ["15min", "1hour", "3hour", "tomorrow"];
            if (typeof arg === "string" && !allowedTokens.includes(arg)) {
                res.status(400).json({ message: "Giá trị duration không hợp lệ" });
                return;
            }
            const updated = await notification_service_1.notificationService.snooze(String(id), userId, arg);
            if (!updated) {
                res.status(404).json({ message: "Notification not found" });
                return;
            }
            res.status(200).json({ notification: updated });
        }
        catch (err) {
            console.error("[notificationController.snooze]", err);
            res.status(500).json({ message: "Failed to snooze notification" });
        }
    },
    // Remove snooze → bring notification back immediately
    unsnooze: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const { id } = req.params;
            const updated = await notification_service_1.notificationService.unsnooze(String(id), userId);
            if (!updated) {
                res.status(404).json({ message: "Notification not found" });
                return;
            }
            res.status(200).json({ notification: updated });
        }
        catch (err) {
            res.status(500).json({ message: "Failed to unsnooze notification" });
        }
    },
    // List currently-snoozed notifications for the user (separate tab)
    listSnoozed: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const items = await notification_service_1.notificationService.listSnoozed(userId);
            res.status(200).json({ items });
        }
        catch (err) {
            res.status(500).json({ message: "Failed to list snoozed notifications" });
        }
    },
    // Expand a group parent → return its absorbed children
    listGroupChildren: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const { id } = req.params;
            const items = await notification_service_1.notificationService.listGroupChildren(String(id), userId);
            res.status(200).json({ items });
        }
        catch (err) {
            res.status(500).json({ message: "Failed to list group children" });
        }
    },
};
