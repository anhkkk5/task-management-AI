import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { adminMiddleware } from "../../middleware/admin.middleware";
import { adminController } from "./admin.controller";

import multer from "multer";
import os from "os";

const adminRouter = Router();

// Disk storage so 500MB+ videos stream directly to temp disk without eating Node.js RAM
const videoUpload = multer({
  dest: os.tmpdir(),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB max file size
  },
});

// Public GET guide video URL for all users
adminRouter.get("/guide-video", adminController.getGuideVideo);

// All subsequent admin routes require authentication + admin role
adminRouter.use(authMiddleware, adminMiddleware);

// Only admin can upload/update guide video to Cloudinary or embed from YouTube
adminRouter.post("/guide-video", videoUpload.single("video"), adminController.uploadGuideVideo);
adminRouter.post("/guide-video/embed", adminController.updateGuideVideoEmbed);

// Dashboard
adminRouter.get("/dashboard", adminController.getDashboardStats);

// User management
adminRouter.get("/users", adminController.listUsers);
adminRouter.get("/users/:id", adminController.getUserDetails);
adminRouter.patch("/users/:id/role", adminController.updateUserRole);
adminRouter.patch("/users/:id/ban", adminController.toggleUserBan);

// Task management
adminRouter.get("/tasks", adminController.listAllTasks);
adminRouter.delete("/tasks/:id", adminController.deleteAnyTask);
adminRouter.get("/tasks/stats", adminController.getTaskStats);

// Notification management
adminRouter.post(
  "/notifications/broadcast",
  adminController.broadcastNotification,
);

// Queue management
adminRouter.get("/queue-status", adminController.getQueueStatus);
adminRouter.post("/queue/retry", adminController.retryFailedJobs);

// Cache management
adminRouter.get("/cache/stats", adminController.getCacheStats);
adminRouter.post("/cache/cleanup", adminController.cleanupOldCache);

export default adminRouter;
