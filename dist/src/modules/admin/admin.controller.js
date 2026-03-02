"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminController = void 0;
const admin_service_1 = require("./admin.service");
exports.adminController = {
    // Dashboard stats
    getDashboardStats: async (req, res) => {
        try {
            const stats = await admin_service_1.adminService.getDashboardStats();
            res.status(200).json({ stats });
        }
        catch (err) {
            console.error("[AdminController] getDashboardStats error:", err);
            res.status(500).json({ message: "Failed to get dashboard stats" });
        }
    },
    // List all users
    listUsers: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const role = req.query.role;
            const search = req.query.search;
            const result = await admin_service_1.adminService.listUsers({
                page,
                limit,
                role,
                search,
            });
            res.status(200).json(result);
        }
        catch (err) {
            console.error("[AdminController] listUsers error:", err);
            res.status(500).json({ message: "Failed to list users" });
        }
    },
    // Get user details
    getUserDetails: async (req, res) => {
        try {
            const { id } = req.params;
            const user = await admin_service_1.adminService.getUserDetails(String(id));
            if (!user) {
                res.status(404).json({ message: "User not found" });
                return;
            }
            res.status(200).json({ user });
        }
        catch (err) {
            console.error("[AdminController] getUserDetails error:", err);
            res.status(500).json({ message: "Failed to get user details" });
        }
    },
    // Update user role
    updateUserRole: async (req, res) => {
        try {
            const { id } = req.params;
            const { role } = req.body;
            if (!role || !["user", "admin"].includes(role)) {
                res
                    .status(400)
                    .json({ message: "Invalid role. Must be 'user' or 'admin'" });
                return;
            }
            const user = await admin_service_1.adminService.updateUserRole(String(id), role);
            if (!user) {
                res.status(404).json({ message: "User not found" });
                return;
            }
            res.status(200).json({
                message: "User role updated successfully",
                user,
            });
        }
        catch (err) {
            console.error("[AdminController] updateUserRole error:", err);
            res.status(500).json({ message: "Failed to update user role" });
        }
    },
    // Ban/unban user
    toggleUserBan: async (req, res) => {
        try {
            const { id } = req.params;
            const { reason } = req.body;
            const result = await admin_service_1.adminService.toggleUserBan(String(id), reason);
            if (!result) {
                res.status(404).json({ message: "User not found" });
                return;
            }
            res.status(200).json({
                message: result.isBanned ? "User banned" : "User unbanned",
                user: result,
            });
        }
        catch (err) {
            console.error("[AdminController] toggleUserBan error:", err);
            res.status(500).json({ message: "Failed to toggle user ban" });
        }
    },
    // List all tasks
    listAllTasks: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 20;
            const status = req.query.status;
            const userId = req.query.userId;
            const result = await admin_service_1.adminService.listAllTasks({
                page,
                limit,
                status,
                userId,
            });
            res.status(200).json(result);
        }
        catch (err) {
            console.error("[AdminController] listAllTasks error:", err);
            res.status(500).json({ message: "Failed to list tasks" });
        }
    },
    // Delete any task
    deleteAnyTask: async (req, res) => {
        try {
            const { id } = req.params;
            const deleted = await admin_service_1.adminService.deleteAnyTask(String(id));
            if (!deleted) {
                res.status(404).json({ message: "Task not found" });
                return;
            }
            res.status(200).json({ message: "Task deleted successfully" });
        }
        catch (err) {
            console.error("[AdminController] deleteAnyTask error:", err);
            res.status(500).json({ message: "Failed to delete task" });
        }
    },
    // Task statistics
    getTaskStats: async (req, res) => {
        try {
            const stats = await admin_service_1.adminService.getTaskStats();
            res.status(200).json({ stats });
        }
        catch (err) {
            console.error("[AdminController] getTaskStats error:", err);
            res.status(500).json({ message: "Failed to get task stats" });
        }
    },
    // Broadcast notification
    broadcastNotification: async (req, res) => {
        try {
            const { title, content, type, sendEmail } = req.body;
            if (!title || !content) {
                res.status(400).json({ message: "Title and content are required" });
                return;
            }
            const result = await admin_service_1.adminService.broadcastNotification({
                title,
                content,
                type: type || "system",
                sendEmail: sendEmail || false,
            });
            res.status(200).json({
                message: "Broadcast notification sent",
                result,
            });
        }
        catch (err) {
            console.error("[AdminController] broadcastNotification error:", err);
            res.status(500).json({ message: "Failed to broadcast notification" });
        }
    },
    // Get queue status
    getQueueStatus: async (req, res) => {
        try {
            const status = await admin_service_1.adminService.getQueueStatus();
            res.status(200).json({ queue: status });
        }
        catch (err) {
            console.error("[AdminController] getQueueStatus error:", err);
            res.status(500).json({ message: "Failed to get queue status" });
        }
    },
    // Retry failed jobs
    retryFailedJobs: async (req, res) => {
        try {
            const result = await admin_service_1.adminService.retryFailedJobs();
            res.status(200).json({
                message: "Failed jobs retry initiated",
                result,
            });
        }
        catch (err) {
            console.error("[AdminController] retryFailedJobs error:", err);
            res.status(500).json({ message: "Failed to retry jobs" });
        }
    },
};
