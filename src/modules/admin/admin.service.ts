import { Types } from "mongoose";
import { User } from "../auth/auth.model";
import { Task } from "../task/task.model";
import { NotificationModel } from "../notification/notification.model";
import { notificationQueueService } from "../notification/notification.queue";
import { notificationService } from "../notification/notification.service";
import { notificationRepository } from "../notification/notification.repository";
import { getRedis } from "../../services/redis.service";

export const adminService = {
  // Dashboard stats
  getDashboardStats: async () => {
    const [
      totalUsers,
      totalTasks,
      totalNotifications,
      todayUsers,
      todayTasks,
    ] = await Promise.all([
      User.countDocuments(),
      Task.countDocuments(),
      NotificationModel.countDocuments(),
      User.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
      Task.countDocuments({
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
  listUsers: async (options: {
    page: number;
    limit: number;
    role?: string;
    search?: string;
  }) => {
    const { page, limit, role, search } = options;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
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
  getUserDetails: async (userId: string) => {
    const user = await User.findById(userId).select("-password").lean();
    if (!user) return null;

    const [tasks, notifications, unreadNotifications] = await Promise.all([
      Task.find({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      NotificationModel.find({ userId: new Types.ObjectId(userId) })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      notificationRepository.countUnread(new Types.ObjectId(userId)),
    ]);

    return {
      ...user,
      stats: {
        totalTasks: await Task.countDocuments({ userId: new Types.ObjectId(userId) }),
        totalNotifications: await NotificationModel.countDocuments({
          userId: new Types.ObjectId(userId),
        }),
        unreadNotifications,
      },
      recentTasks: tasks,
      recentNotifications: notifications,
    };
  },

  // Update user role
  updateUserRole: async (userId: string, role: "user" | "admin") => {
    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).select("-password");
    return user;
  },

  // Toggle user ban
  toggleUserBan: async (userId: string, reason?: string) => {
    const user = await User.findById(userId);
    if (!user) return null;

    // Toggle isBanned field (cần thêm vào schema nếu chưa có)
    const isBanned = (user as any).isBanned;
    (user as any).isBanned = !isBanned;
    (user as any).banReason = !isBanned ? reason : null;
    (user as any).bannedAt = !isBanned ? new Date() : null;

    await user.save();
    return {
      id: String(user._id),
      isBanned: (user as any).isBanned,
      banReason: (user as any).banReason,
    };
  },

  // List all tasks
  listAllTasks: async (options: {
    page: number;
    limit: number;
    status?: string;
    userId?: string;
  }) => {
    const { page, limit, status, userId } = options;
    const skip = (page - 1) * limit;

    const query: any = {};
    if (status) query.status = status;
    if (userId) query.userId = new Types.ObjectId(userId);

    const [tasks, total] = await Promise.all([
      Task.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "name email")
        .lean(),
      Task.countDocuments(query),
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
  deleteAnyTask: async (taskId: string) => {
    const result = await Task.findByIdAndDelete(taskId);
    return !!result;
  },

  // Task statistics
  getTaskStats: async () => {
    const [byStatus, byPriority, total] = await Promise.all([
      Task.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $group: { _id: "$priority", count: { $sum: 1 } } },
      ]),
      Task.countDocuments(),
    ]);

    const overdue = await Task.countDocuments({
      deadline: { $lt: new Date() },
      status: { $nin: ["completed", "cancelled"] },
    });

    return {
      total,
      overdue,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>),
      byPriority: byPriority.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {} as Record<string, number>),
    };
  },

  // Broadcast notification
  broadcastNotification: async (data: {
    title: string;
    content: string;
    type: string;
    sendEmail: boolean;
  }) => {
    // Lấy tất cả users
    const users = await User.find({}).select("_id email").lean();

    let sentCount = 0;
    let emailCount = 0;

    for (const user of users) {
      await notificationService.create({
        userId: String(user._id),
        type: data.type as any,
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
      if (data.sendEmail) emailCount++;
    }

    return { totalUsers: users.length, notificationsSent: sentCount, emailsQueued: emailCount };
  },

  // Get queue status
  getQueueStatus: async () => {
    return notificationQueueService.getStatus();
  },

  // Retry failed jobs
  retryFailedJobs: async () => {
    // Lấy failed jobs và retry
    const failedJobs = await notificationQueueService.getFailedJobs?.() || [];
    
    let retried = 0;
    for (const job of failedJobs.slice(0, 10)) {
      try {
        await job.retry();
        retried++;
      } catch (err) {
        console.error(`Failed to retry job ${job.id}:`, err);
      }
    }

    return { retried, totalFailed: failedJobs.length };
  },
};
