"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const admin_middleware_1 = require("../../middleware/admin.middleware");
const admin_controller_1 = require("./admin.controller");
const multer_1 = __importDefault(require("multer"));
const os_1 = __importDefault(require("os"));
const adminRouter = (0, express_1.Router)();
// Disk storage so 500MB+ videos stream directly to temp disk without eating Node.js RAM
const videoUpload = (0, multer_1.default)({
    dest: os_1.default.tmpdir(),
    limits: {
        fileSize: 2 * 1024 * 1024 * 1024, // 2GB max file size
    },
});
// Public GET guide video URL for all users
adminRouter.get("/guide-video", admin_controller_1.adminController.getGuideVideo);
// All subsequent admin routes require authentication + admin role
adminRouter.use(auth_middleware_1.authMiddleware, admin_middleware_1.adminMiddleware);
// Only admin can upload/update guide video to Cloudinary or embed from YouTube
adminRouter.post("/guide-video", videoUpload.single("video"), admin_controller_1.adminController.uploadGuideVideo);
adminRouter.post("/guide-video/embed", admin_controller_1.adminController.updateGuideVideoEmbed);
// Dashboard
adminRouter.get("/dashboard", admin_controller_1.adminController.getDashboardStats);
// User management
adminRouter.get("/users", admin_controller_1.adminController.listUsers);
adminRouter.get("/users/:id", admin_controller_1.adminController.getUserDetails);
adminRouter.patch("/users/:id/role", admin_controller_1.adminController.updateUserRole);
adminRouter.patch("/users/:id/ban", admin_controller_1.adminController.toggleUserBan);
// Task management
adminRouter.get("/tasks", admin_controller_1.adminController.listAllTasks);
adminRouter.delete("/tasks/:id", admin_controller_1.adminController.deleteAnyTask);
adminRouter.get("/tasks/stats", admin_controller_1.adminController.getTaskStats);
// Notification management
adminRouter.post("/notifications/broadcast", admin_controller_1.adminController.broadcastNotification);
// Queue management
adminRouter.get("/queue-status", admin_controller_1.adminController.getQueueStatus);
adminRouter.post("/queue/retry", admin_controller_1.adminController.retryFailedJobs);
// Cache management
adminRouter.get("/cache/stats", admin_controller_1.adminController.getCacheStats);
adminRouter.post("/cache/cleanup", admin_controller_1.adminController.cleanupOldCache);
exports.default = adminRouter;
