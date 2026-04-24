import { Request, Response } from "express";
import { notificationService } from "./notification.service";
import { NotificationType } from "./notification.model";
import { notificationRepository } from "./notification.repository";
import { Types } from "mongoose";

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

      const total = await notificationRepository.countForUser(
        new Types.ObjectId(userId),
        { isRead, type },
      );

      res.status(200).json({ items: notifications, total, unreadCount });
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

  // Delete notification
  delete: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { id } = req.params;
      const deleted = await notificationService.delete(String(id), userId);

      if (!deleted) {
        res.status(404).json({ message: "Notification not found" });
        return;
      }

      res.status(200).json({ message: "Notification deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete notification" });
    }
  },

  // Snooze a notification → accepts { duration?: "15min"|"1hour"|"3hour"|"tomorrow", minutes?: number }
  snooze: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { id } = req.params;
      const { duration, minutes } = req.body || {};

      let arg: any = duration;
      if (!arg && typeof minutes === "number") arg = minutes;
      if (!arg) {
        res.status(400).json({
          message:
            "Thiếu tham số duration hoặc minutes (ví dụ: '15min', '1hour', 'tomorrow', hoặc số phút)",
        });
        return;
      }

      const allowedTokens = ["15min", "1hour", "3hour", "tomorrow"];
      if (typeof arg === "string" && !allowedTokens.includes(arg)) {
        res.status(400).json({ message: "Giá trị duration không hợp lệ" });
        return;
      }

      const updated = await notificationService.snooze(String(id), userId, arg);
      if (!updated) {
        res.status(404).json({ message: "Notification not found" });
        return;
      }
      res.status(200).json({ notification: updated });
    } catch (err) {
      console.error("[notificationController.snooze]", err);
      res.status(500).json({ message: "Failed to snooze notification" });
    }
  },

  // Remove snooze → bring notification back immediately
  unsnooze: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { id } = req.params;
      const updated = await notificationService.unsnooze(String(id), userId);
      if (!updated) {
        res.status(404).json({ message: "Notification not found" });
        return;
      }
      res.status(200).json({ notification: updated });
    } catch (err) {
      res.status(500).json({ message: "Failed to unsnooze notification" });
    }
  },

  // List currently-snoozed notifications for the user (separate tab)
  listSnoozed: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const items = await notificationService.listSnoozed(userId);
      res.status(200).json({ items });
    } catch (err) {
      res.status(500).json({ message: "Failed to list snoozed notifications" });
    }
  },

  // Expand a group parent → return its absorbed children
  listGroupChildren: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const { id } = req.params;
      const items = await notificationService.listGroupChildren(
        String(id),
        userId,
      );
      res.status(200).json({ items });
    } catch (err) {
      res.status(500).json({ message: "Failed to list group children" });
    }
  },
};
