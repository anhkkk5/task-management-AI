import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { notificationController } from "./notification.controller";

const notificationRouter = Router();

// List notifications
notificationRouter.get("/", authMiddleware, notificationController.list);

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

export default notificationRouter;
