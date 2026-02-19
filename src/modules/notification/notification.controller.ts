import { Request, Response } from "express";
import { notificationService } from "./notification.service";
import { NotificationType } from "./notification.model";

export const notificationController = {
  // List notifications for current user
  list: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const isRead =
        req.query.isRead === "true"
          ? true
          : req.query.isRead === "false"
            ? false
            : undefined;
      const type = req.query.type as NotificationType | undefined;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const notifications = await notificationService.list(userId, {
        isRead,
        type,
        limit,
        offset,
      });
      const unreadCount = await notificationService.countUnread(userId);

      res.status(200).json({ notifications, unreadCount });
    } catch (err) {
      res.status(500).json({ message: "Failed to list notifications" });
    }
  },

  // Mark notification as read
  markAsRead: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { id } = req.params;
      const notification = await notificationService.markAsRead(
        String(id),
        userId,
      );

      if (!notification) {
        res.status(404).json({ message: "Notification not found" });
        return;
      }

      res.status(200).json({ notification });
    } catch (err) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  },

  // Mark all notifications as read
  markAllAsRead: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      await notificationService.markAllAsRead(userId);
      res.status(200).json({ message: "All notifications marked as read" });
    } catch (err) {
      res.status(500).json({ message: "Failed to mark notifications as read" });
    }
  },
};
