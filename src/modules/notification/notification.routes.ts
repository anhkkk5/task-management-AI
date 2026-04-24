import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { notificationController } from "./notification.controller";
import { notificationQueueService } from "./notification.queue";

const notificationRouter = Router();

// List notifications
notificationRouter.get("/", authMiddleware, notificationController.list);

// Get queue status (admin/debug)
notificationRouter.get("/queue-status", authMiddleware, async (req, res) => {
  try {
    const status = await notificationQueueService.getStatus();
    res.json({ queue: status });
  } catch (err) {
    res.status(500).json({ message: "Failed to get queue status" });
  }
});

// Mark notification as read
notificationRouter.patch(
  "/:id/read",
  authMiddleware,
  notificationController.markAsRead,
);

// Mark all notifications as read
notificationRouter.patch(
  "/read-all",
  authMiddleware,
  notificationController.markAllAsRead,
);

// Delete notification
notificationRouter.delete(
  "/:id",
  authMiddleware,
  notificationController.delete,
);

// Snooze notification: body { duration: "15min"|"1hour"|"3hour"|"tomorrow", minutes?: number }
notificationRouter.post(
  "/:id/snooze",
  authMiddleware,
  notificationController.snooze,
);

// Unsnooze (resurrect immediately)
notificationRouter.post(
  "/:id/unsnooze",
  authMiddleware,
  notificationController.unsnooze,
);

// List currently-snoozed notifications for the logged-in user
notificationRouter.get(
  "/snoozed/list",
  authMiddleware,
  notificationController.listSnoozed,
);

// Expand a group parent → list its children
notificationRouter.get(
  "/:id/group-children",
  authMiddleware,
  notificationController.listGroupChildren,
);

export default notificationRouter;
