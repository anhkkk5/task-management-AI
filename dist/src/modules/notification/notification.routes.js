"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const notification_controller_1 = require("./notification.controller");
const notification_queue_1 = require("./notification.queue");
const notificationRouter = (0, express_1.Router)();
// List notifications
notificationRouter.get("/", auth_middleware_1.authMiddleware, notification_controller_1.notificationController.list);
// Get queue status (admin/debug)
notificationRouter.get("/queue-status", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const status = await notification_queue_1.notificationQueueService.getStatus();
        res.json({ queue: status });
    }
    catch (err) {
        res.status(500).json({ message: "Failed to get queue status" });
    }
});
// Mark notification as read
notificationRouter.patch("/:id/read", auth_middleware_1.authMiddleware, notification_controller_1.notificationController.markAsRead);
// Mark all notifications as read
notificationRouter.patch("/read-all", auth_middleware_1.authMiddleware, notification_controller_1.notificationController.markAllAsRead);
// Delete notification
notificationRouter.delete("/:id", auth_middleware_1.authMiddleware, notification_controller_1.notificationController.delete);
// Snooze notification: body { duration: "15min"|"1hour"|"3hour"|"tomorrow", minutes?: number }
notificationRouter.post("/:id/snooze", auth_middleware_1.authMiddleware, notification_controller_1.notificationController.snooze);
// Unsnooze (resurrect immediately)
notificationRouter.post("/:id/unsnooze", auth_middleware_1.authMiddleware, notification_controller_1.notificationController.unsnooze);
// List currently-snoozed notifications for the logged-in user
notificationRouter.get("/snoozed/list", auth_middleware_1.authMiddleware, notification_controller_1.notificationController.listSnoozed);
// Expand a group parent → list its children
notificationRouter.get("/:id/group-children", auth_middleware_1.authMiddleware, notification_controller_1.notificationController.listGroupChildren);
exports.default = notificationRouter;
