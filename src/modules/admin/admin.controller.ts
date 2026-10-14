import { Request, Response } from "express";
import { Types } from "mongoose";
import { adminService } from "./admin.service";

export const adminController = {
  // Dashboard stats
  getDashboardStats: async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await adminService.getDashboardStats();
      res.status(200).json({ stats });
    } catch (err) {
      console.error("[AdminController] getDashboardStats error:", err);
      res.status(500).json({ message: "Failed to get dashboard stats" });
    }
  },

  // List all users
  listUsers: async (req: Request, res: Response): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const role = req.query.role as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await adminService.listUsers({
        page,
        limit,
        role,
        search,
      });

      res.status(200).json(result);
    } catch (err) {
      console.error("[AdminController] listUsers error:", err);
      res.status(500).json({ message: "Failed to list users" });
    }
  },

  // Get user details
  getUserDetails: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const user = await adminService.getUserDetails(String(id));

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      res.status(200).json({ user });
    } catch (err) {
      console.error("[AdminController] getUserDetails error:", err);
      res.status(500).json({ message: "Failed to get user details" });
    }
  },

  // Update user role
  updateUserRole: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role || !["user", "admin"].includes(role)) {
        res
          .status(400)
          .json({ message: "Invalid role. Must be 'user' or 'admin'" });
        return;
      }

      const user = await adminService.updateUserRole(String(id), role);

      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      res.status(200).json({
        message: "User role updated successfully",
        user,
      });
    } catch (err) {
      console.error("[AdminController] updateUserRole error:", err);
      res.status(500).json({ message: "Failed to update user role" });
    }
  },

  // Ban/unban user
  toggleUserBan: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const result = await adminService.toggleUserBan(String(id), reason);

      if (!result) {
        res.status(404).json({ message: "User not found" });
        return;
      }

      res.status(200).json({
        message: result.isBanned ? "User banned" : "User unbanned",
        user: result,
      });
    } catch (err) {
      console.error("[AdminController] toggleUserBan error:", err);
      res.status(500).json({ message: "Failed to toggle user ban" });
    }
  },

  // List all tasks
  listAllTasks: async (req: Request, res: Response): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;
      const userId = req.query.userId as string | undefined;

      const result = await adminService.listAllTasks({
        page,
        limit,
        status,
        userId,
      });

      res.status(200).json(result);
    } catch (err) {
      console.error("[AdminController] listAllTasks error:", err);
      res.status(500).json({ message: "Failed to list tasks" });
    }
  },

  // Delete any task
  deleteAnyTask: async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const deleted = await adminService.deleteAnyTask(String(id));

      if (!deleted) {
        res.status(404).json({ message: "Task not found" });
        return;
      }

      res.status(200).json({ message: "Task deleted successfully" });
    } catch (err) {
      console.error("[AdminController] deleteAnyTask error:", err);
      res.status(500).json({ message: "Failed to delete task" });
    }
  },

  // Task statistics
  getTaskStats: async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await adminService.getTaskStats();
      res.status(200).json({ stats });
    } catch (err) {
      console.error("[AdminController] getTaskStats error:", err);
      res.status(500).json({ message: "Failed to get task stats" });
    }
  },

  // Broadcast notification
  broadcastNotification: async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, content, type, sendEmail } = req.body;

      if (!title || !content) {
        res.status(400).json({ message: "Title and content are required" });
        return;
      }

      const result = await adminService.broadcastNotification({
        title,
        content,
        type: type || "system",
        sendEmail: sendEmail || false,
      });

      res.status(200).json({
        message: "Broadcast notification sent",
        result,
      });
    } catch (err) {
      console.error("[AdminController] broadcastNotification error:", err);
      res.status(500).json({ message: "Failed to broadcast notification" });
    }
  },

  // Get queue status
  getQueueStatus: async (req: Request, res: Response): Promise<void> => {
    try {
      const status = await adminService.getQueueStatus();
      res.status(200).json({ queue: status });
    } catch (err) {
      console.error("[AdminController] getQueueStatus error:", err);
      res.status(500).json({ message: "Failed to get queue status" });
    }
  },

  // Retry failed jobs
  retryFailedJobs: async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await adminService.retryFailedJobs();
      res.status(200).json({
        message: "Failed jobs retry initiated",
        result,
      });
    } catch (err) {
      console.error("[AdminController] retryFailedJobs error:", err);
      res.status(500).json({ message: "Failed to retry jobs" });
    }
  },

  // Cache management
  getCacheStats: async (req: Request, res: Response): Promise<void> => {
    try {
      const { cacheCleanupService } =
        await import("../../services/cache-cleanup.service");
      const stats = await cacheCleanupService.getStats();
      res.status(200).json({ stats });
    } catch (err) {
      console.error("[AdminController] getCacheStats error:", err);
      res.status(500).json({ message: "Failed to get cache stats" });
    }
  },

  cleanupOldCache: async (req: Request, res: Response): Promise<void> => {
    try {
      const { cacheCleanupService } =
        await import("../../services/cache-cleanup.service");
      await cacheCleanupService.cleanup();
      const stats = await cacheCleanupService.getStats();
      res.status(200).json({
        message: "Cache cleanup completed",
        stats,
      });
    } catch (err) {
      console.error("[AdminController] cleanupOldCache error:", err);
      res.status(500).json({ message: "Failed to cleanup cache" });
    }
  },

  // Guide video management
  getGuideVideo: async (_req: Request, res: Response): Promise<void> => {
    try {
      const { SystemSetting } = await import("./system-setting.model");
      const setting = await SystemSetting.findOne({ key: "guide_video" }).lean();
      const videoUrl = setting?.value?.url || "/videos/guide-tasks.mp4";
      const videoType =
        setting?.value?.type ||
        (videoUrl.includes("youtube") || videoUrl.includes("youtu.be")
          ? "youtube"
          : "video");
      const rawEmbed = setting?.value?.rawEmbed || "";
      res.status(200).json({ ok: true, videoUrl, videoType, rawEmbed });
    } catch (err) {
      console.error("[AdminController] getGuideVideo error:", err);
      res.status(200).json({ ok: true, videoUrl: "/videos/guide-tasks.mp4", videoType: "video" });
    }
  },

  updateGuideVideoEmbed: async (req: Request, res: Response): Promise<void> => {
    try {
      const { embedCode, videoUrl } = req.body;
      const rawInput = (embedCode || videoUrl || "").trim();

      if (!rawInput) {
        res.status(400).json({ message: "Vui lòng nhập mã nhúng iframe hoặc liên kết video YouTube" });
        return;
      }

      let parsedEmbedUrl = "";

      // 1. Phân tích nếu dán đoạn mã iframe (ví dụ: <iframe ... src="https://www.youtube.com/embed/..." ...></iframe>)
      const iframeSrcMatch = rawInput.match(/src=["']([^"']+)["']/i);
      if (iframeSrcMatch && iframeSrcMatch[1]) {
        parsedEmbedUrl = iframeSrcMatch[1];
      } else {
        // 2. Phân tích nếu dán trực tiếp link YouTube (watch, embed, youtu.be, shorts)
        const ytMatch = rawInput.match(
          /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i,
        );
        if (ytMatch && ytMatch[1]) {
          parsedEmbedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
        } else if (rawInput.startsWith("http://") || rawInput.startsWith("https://")) {
          parsedEmbedUrl = rawInput;
        }
      }

      if (!parsedEmbedUrl) {
        res.status(400).json({ message: "Mã nhúng hoặc liên kết YouTube không hợp lệ" });
        return;
      }

      const { SystemSetting } = await import("./system-setting.model");
      await SystemSetting.findOneAndUpdate(
        { key: "guide_video" },
        {
          $set: {
            value: {
              url: parsedEmbedUrl,
              type: "youtube",
              rawEmbed: rawInput,
              updatedAt: new Date(),
            },
          },
        },
        { upsert: true, new: true },
      );

      res.status(200).json({
        ok: true,
        message: "Cập nhật video nhúng YouTube thành công",
        videoUrl: parsedEmbedUrl,
        videoType: "youtube",
      });
    } catch (err: any) {
      console.error("[AdminController] updateGuideVideoEmbed error:", err);
      res.status(500).json({ message: err?.message || "Cập nhật video nhúng thất bại" });
    }
  },

  uploadGuideVideo: async (req: Request, res: Response): Promise<void> => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ message: "Vui lòng chọn file video" });
      return;
    }

    const filePath = file.path;
    const { uploadLargeVideoFile } = await import("../../services/cloudinary.service");
    const { SystemSetting } = await import("./system-setting.model");
    const fs = await import("fs");

    try {
      const uploaded = await uploadLargeVideoFile(filePath, {
        folder: "taskmind-guide-videos",
        publicId: `guide_video_${Date.now()}`,
      });

      await SystemSetting.findOneAndUpdate(
        { key: "guide_video" },
        {
          $set: {
            value: {
              url: uploaded.url,
              publicId: uploaded.publicId,
              type: "video",
              updatedAt: new Date(),
            },
          },
        },
        { upsert: true, new: true },
      );

      res.status(200).json({
        ok: true,
        message: "Tải lên video hướng dẫn lên Cloudinary thành công",
        videoUrl: uploaded.url,
        videoType: "video",
      });
    } catch (err: any) {
      console.error("[AdminController] uploadGuideVideo error:", err);
      res.status(500).json({ message: err?.message || "Tải lên video thất bại" });
    } finally {
      if (filePath) {
        fs.unlink(filePath, () => {});
      }
    }
  },
};
