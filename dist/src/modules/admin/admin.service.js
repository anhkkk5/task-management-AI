"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminService = void 0;
const mongoose_1 = require("mongoose");
const auth_model_1 = require("../auth/auth.model");
const task_model_1 = require("../task/task.model");
const notification_model_1 = require("../notification/notification.model");
const notification_queue_1 = require("../notification/notification.queue");
const notification_service_1 = require("../notification/notification.service");
const notification_repository_1 = require("../notification/notification.repository");
exports.adminService = {
    // Dashboard stats
    getDashboardStats: async () => {
        const [totalUsers, totalTasks, totalNotifications, todayUsers, todayTasks,] = await Promise.all([
            auth_model_1.User.countDocuments(),
            task_model_1.Task.countDocuments(),
            notification_model_1.NotificationModel.countDocuments(),
            auth_model_1.User.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            }),
            task_model_1.Task.countDocuments({
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            }),
        ]);
        return {
            users: { total: totalUsers, today: todayUsers },
            tasks: { total: totalTasks, today: todayTasks },
            notifications: { total: totalNotifications },
        };
    },
    // List all users
    listUsers: async (options) => {
        const { page, limit, role, search } = options;
        const skip = (page - 1) * limit;
        const query = {};
        if (role)
            query.role = role;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }
        const [users, total] = await Promise.all([
            auth_model_1.User.find(query)
                .select("-password")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            auth_model_1.User.countDocuments(query),
        ]);
        return {
            users,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    },
    // Get user details
    getUserDetails: async (userId) => {
        const user = await auth_model_1.User.findById(userId).select("-password").lean();
        if (!user)
            return null;
        const [tasks, notifications, unreadNotifications] = await Promise.all([
            task_model_1.Task.find({ userId: new mongoose_1.Types.ObjectId(userId) })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),
            notification_model_1.NotificationModel.find({ userId: new mongoose_1.Types.ObjectId(userId) })
                .sort({ createdAt: -1 })
                .limit(10)
                .lean(),
            notification_repository_1.notificationRepository.countUnread(new mongoose_1.Types.ObjectId(userId)),
        ]);
        return {
            ...user,
            stats: {
                totalTasks: await task_model_1.Task.countDocuments({ userId: new mongoose_1.Types.ObjectId(userId) }),
                totalNotifications: await notification_model_1.NotificationModel.countDocuments({
                    userId: new mongoose_1.Types.ObjectId(userId),
                }),
                unreadNotifications,
            },
            recentTasks: tasks,
            recentNotifications: notifications,
        };
    },
    // Update user role
    updateUserRole: async (userId, role) => {
        const user = await auth_model_1.User.findByIdAndUpdate(userId, { role }, { new: true }).select("-password");
        return user;
    },
    // Toggle user ban
    toggleUserBan: async (userId, reason) => {
        const user = await auth_model_1.User.findById(userId);
        if (!user)
            return null;
        // Toggle isBanned field (cần thêm vào schema nếu chưa có)
        const isBanned = user.isBanned;
        user.isBanned = !isBanned;
        user.banReason = !isBanned ? reason : null;
        user.bannedAt = !isBanned ? new Date() : null;
        await user.save();
        return {
            id: String(user._id),
            isBanned: user.isBanned,
            banReason: user.banReason,
        };
    },
    // List all tasks
    listAllTasks: async (options) => {
        const { page, limit, status, userId } = options;
        const skip = (page - 1) * limit;
        const query = {};
        if (status)
            query.status = status;
        if (userId)
            query.userId = new mongoose_1.Types.ObjectId(userId);
        const [tasks, total] = await Promise.all([
            task_model_1.Task.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("userId", "name email")
                .lean(),
            task_model_1.Task.countDocuments(query),
        ]);
        return {
            tasks,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        };
    },
    // Delete any task
    deleteAnyTask: async (taskId) => {
        const result = await task_model_1.Task.findByIdAndDelete(taskId);
        return !!result;
    },
    // Task statistics
    getTaskStats: async () => {
        const [byStatus, byPriority, total] = await Promise.all([
            task_model_1.Task.aggregate([
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]),
            task_model_1.Task.aggregate([
                { $group: { _id: "$priority", count: { $sum: 1 } } },
            ]),
            task_model_1.Task.countDocuments(),
        ]);
        const overdue = await task_model_1.Task.countDocuments({
            deadline: { $lt: new Date() },
            status: { $nin: ["completed", "cancelled"] },
        });
        return {
            total,
            overdue,
            byStatus: byStatus.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            byPriority: byPriority.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
        };
    },
    // Broadcast notification
    broadcastNotification: async (data) => {
        // Lấy tất cả users
        const users = await auth_model_1.User.find({}).select("_id email").lean();
        let sentCount = 0;
        let emailCount = 0;
        for (const user of users) {
            await notification_service_1.notificationService.create({
                userId: String(user._id),
                type: data.type,
                title: data.title,
                content: data.content,
                data: { broadcast: true },
                channels: {
                    inApp: true,
                    email: data.sendEmail,
                    push: false,
                },
            });
            sentCount++;
            if (data.sendEmail)
                emailCount++;
        }
        return { totalUsers: users.length, notificationsSent: sentCount, emailsQueued: emailCount };
    },
    // Get queue status
    getQueueStatus: async () => {
        return notification_queue_1.notificationQueueService.getStatus();
    },
    // Retry failed jobs
    retryFailedJobs: async () => {
        // Lấy failed jobs và retry
        const failedJobs = await notification_queue_1.notificationQueueService.getFailedJobs?.() || [];
        let retried = 0;
        for (const job of failedJobs.slice(0, 10)) {
            try {
                await job.retry();
                retried++;
            }
            catch (err) {
                console.error(`Failed to retry job ${job.id}:`, err);
            }
        }
        return { retried, totalFailed: failedJobs.length };
    },
};
