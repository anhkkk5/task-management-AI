"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskService = void 0;
const mongoose_1 = require("mongoose");
const task_repository_1 = require("./task.repository");
const redis_service_1 = require("../../services/redis.service");
const ai_service_1 = require("../ai/ai.service");
const user_habit_repository_1 = require("../user/user-habit.repository");
const notification_repository_1 = require("../notification/notification.repository");
const notification_model_1 = require("../notification/notification.model");
const notification_queue_1 = require("../notification/notification.queue");
const user_repository_1 = require("../user/user.repository");
const toPublicTask = (t) => {
    return {
        id: String(t._id),
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        deadline: t.deadline,
        tags: t.tags ?? [],
        type: t.type,
        allDay: t.allDay,
        guests: t.guests ?? [],
        location: t.location,
        visibility: t.visibility ?? "default",
        reminderMinutes: t.reminderMinutes,
        recurrence: t.recurrence,
        meetingLink: t.meetingLink,
        userId: String(t.userId),
        parentTaskId: t.parentTaskId ? String(t.parentTaskId) : undefined,
        aiBreakdown: (t.aiBreakdown ?? []).map((x) => ({
            title: x.title,
            status: x.status,
            estimatedDuration: x.estimatedDuration,
        })),
        estimatedDuration: t.estimatedDuration,
        dailyTargetDuration: t.dailyTargetDuration,
        dailyTargetMin: t.dailyTargetMin,
        scheduledTime: t.scheduledTime,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
    };
};
// Generate invite email HTML template
const generateInviteEmailHtml = (params) => {
    const timeStr = params.startTime
        ? `${params.startTime.toLocaleString("vi-VN")}${params.endTime ? ` - ${params.endTime.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : ""}`
        : "Không có thời gian cụ thể";
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lời mời tham gia: ${params.taskTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { background: #f9f9f9; border-radius: 8px; padding: 30px; }
    .header { border-bottom: 2px solid #4CAF50; padding-bottom: 15px; margin-bottom: 20px; }
    .title { font-size: 24px; font-weight: bold; color: #333; margin: 0; }
    .content { font-size: 16px; color: #555; margin: 20px 0; }
    .detail { background: #fff; border-radius: 4px; padding: 15px; margin: 15px 0; }
    .detail-item { margin: 8px 0; }
    .detail-label { font-weight: bold; color: #666; }
    .button { display: inline-block; background: #4CAF50; color: white; text-decoration: none; padding: 12px 24px; border-radius: 4px; margin-top: 20px; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="title">Bạn được mời tham gia: ${params.taskTitle}</h1>
    </div>
    <div class="content">
      <p><strong>${params.organizerName}</strong> (${params.organizerEmail}) đã mời bạn tham gia sự kiện.</p>
    </div>
    <div class="detail">
      <div class="detail-item"><span class="detail-label">Thời gian:</span> ${timeStr}</div>
      ${params.location ? `<div class="detail-item"><span class="detail-label">Địa điểm:</span> ${params.location}</div>` : ""}
      ${params.meetingLink ? `<div class="detail-item"><span class="detail-label">Link họp:</span> <a href="${params.meetingLink}">${params.meetingLink}</a></div>` : ""}
      ${params.description ? `<div class="detail-item"><span class="detail-label">Mô tả:</span> ${params.description}</div>` : ""}
    </div>
    <div class="footer">
      <p>Email này được gửi tự động từ Task Management System.</p>
    </div>
  </div>
</body>
</html>`;
};
// Send invite emails to guests
const sendGuestInvites = async (params) => {
    const { userId, task, previousGuests = [] } = params;
    if (!task.guests || task.guests.length === 0)
        return;
    // Chỉ gửi cho guests mới (không có trong previousGuests)
    const newGuests = task.guests.filter((g) => !previousGuests.includes(g));
    if (newGuests.length === 0)
        return;
    // Lấy thông tin organizer
    const organizer = await user_repository_1.userRepository.findById(userId);
    if (!organizer)
        return;
    const organizerName = organizer.name || organizer.email;
    const organizerEmail = organizer.email;
    for (const guestEmail of newGuests) {
        // Không gửi cho chính organizer
        if (guestEmail === organizerEmail.toLowerCase())
            continue;
        const html = generateInviteEmailHtml({
            taskTitle: task.title,
            organizerName,
            organizerEmail,
            startTime: task.scheduledTime?.start,
            endTime: task.scheduledTime?.end,
            location: task.location,
            meetingLink: task.meetingLink,
            description: task.description,
        });
        await notification_queue_1.notificationQueueService.addInviteEmail({
            to: guestEmail,
            subject: `Lời mời tham gia: ${task.title}`,
            html,
            taskTitle: task.title,
            organizerEmail,
        });
    }
};
const tasksListCacheKey = (params) => {
    const parts = [
        `tasks:user:${params.userId}`,
        `status=${params.status ?? ""}`,
        `priority=${params.priority ?? ""}`,
        `keyword=${params.keyword ?? ""}`,
        `deadlineFrom=${params.deadlineFrom ? params.deadlineFrom.toISOString() : ""}`,
        `deadlineTo=${params.deadlineTo ? params.deadlineTo.toISOString() : ""}`,
        `page=${params.page}`,
        `limit=${params.limit}`,
    ];
    return parts.join(":");
};
const tasksOverdueCacheKey = (params) => {
    return `tasks:user:${params.userId}:overdue:page=${params.page}:limit=${params.limit}`;
};
const getTasksCacheTtlSeconds = () => {
    const min = 60;
    const max = 180;
    return Math.floor(Math.random() * (max - min + 1)) + min;
};
const parseCachedTaskList = (raw) => {
    const obj = JSON.parse(raw);
    return {
        ...obj,
        items: obj.items.map((t) => ({
            ...t,
            deadline: t.deadline ? new Date(t.deadline) : undefined,
            reminderAt: t.reminderAt ? new Date(t.reminderAt) : undefined,
            createdAt: new Date(t.createdAt),
            updatedAt: new Date(t.updatedAt),
            dailyTargetDuration: t.dailyTargetDuration,
            dailyTargetMin: t.dailyTargetMin,
        })),
    };
};
const invalidateTasksCache = async (userId) => {
    try {
        const redis = (0, redis_service_1.getRedis)();
        const prefix = `tasks:user:${userId}`;
        const keys = [];
        let cursor = "0";
        do {
            const [next, batch] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
            cursor = next;
            if (Array.isArray(batch) && batch.length) {
                keys.push(...batch);
            }
        } while (cursor !== "0");
        if (keys.length) {
            await redis.del(...keys);
        }
    }
    catch (_err) {
        return;
    }
};
exports.taskService = {
    create: async (userId, dto) => {
        const title = dto.title?.trim();
        if (!title) {
            throw new Error("INVALID_TITLE");
        }
        const parentTaskId = dto.parentTaskId
            ? new mongoose_1.Types.ObjectId(dto.parentTaskId)
            : undefined;
        const doc = await task_repository_1.taskRepository.create({
            title,
            description: dto.description,
            type: dto.type,
            allDay: dto.allDay,
            guests: dto.guests,
            location: dto.location,
            visibility: dto.visibility,
            reminderMinutes: dto.reminderMinutes,
            recurrence: dto.recurrence,
            meetingLink: dto.meetingLink,
            deadline: dto.deadline,
            priority: dto.priority,
            tags: dto.tags,
            userId: new mongoose_1.Types.ObjectId(userId),
            reminderAt: dto.reminderAt,
            estimatedDuration: dto.estimatedDuration,
            dailyTargetDuration: dto.dailyTargetDuration,
            dailyTargetMin: dto.dailyTargetMin,
            parentTaskId,
            scheduledTime: dto.scheduledTime
                ? {
                    start: dto.scheduledTime.start,
                    end: dto.scheduledTime.end,
                    aiPlanned: dto.scheduledTime.aiPlanned ?? false,
                    reason: dto.scheduledTime.reason,
                }
                : undefined,
        });
        // Auto-breakdown for all tasks (with AI analysis)
        // Trigger auto-breakdown asynchronously (don't wait)
        exports.taskService.autoBreakdown(userId, String(doc._id)).catch((error) => {
            console.error("[AutoBreakdown] Failed for task:", doc._id, error.message);
        });
        await invalidateTasksCache(userId);
        const publicTask = toPublicTask(doc);
        // Send invite emails to guests (don't wait)
        if (dto.guests && dto.guests.length > 0) {
            sendGuestInvites({ userId, task: publicTask }).catch((err) => {
                console.error("[TaskService] Failed to send guest invites:", err.message);
            });
        }
        return publicTask;
    },
    getById: async (userId, taskId) => {
        const doc = await task_repository_1.taskRepository.findByIdForUser({
            taskId,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!doc) {
            throw new Error("TASK_FORBIDDEN");
        }
        return toPublicTask(doc);
    },
    update: async (userId, taskId, dto) => {
        const title = dto.title !== undefined ? dto.title.trim() : undefined;
        if (title !== undefined && title.length === 0) {
            throw new Error("INVALID_TITLE");
        }
        // Get current task to check status change
        const currentTask = await task_repository_1.taskRepository.findByIdForUser({
            taskId,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!currentTask) {
            throw new Error("TASK_FORBIDDEN");
        }
        const updated = await task_repository_1.taskRepository.updateByIdForUser({
            taskId,
            userId: new mongoose_1.Types.ObjectId(userId),
        }, {
            title,
            description: dto.description,
            type: dto.type,
            allDay: dto.allDay,
            guests: dto.guests,
            location: dto.location,
            visibility: dto.visibility,
            reminderMinutes: dto.reminderMinutes,
            recurrence: dto.recurrence,
            meetingLink: dto.meetingLink,
            status: dto.status,
            priority: dto.priority,
            deadline: dto.deadline,
            tags: dto.tags,
            reminderAt: dto.reminderAt,
            aiBreakdown: dto.aiBreakdown,
            estimatedDuration: dto.estimatedDuration,
            dailyTargetDuration: dto.dailyTargetDuration,
            dailyTargetMin: dto.dailyTargetMin,
            scheduledTime: dto.scheduledTime,
        });
        // If scheduledTime was updated, delete old scheduled notifications for this task
        // so that new reminders can be sent for the new time
        if (dto.scheduledTime && updated) {
            try {
                const deletedCount = await notification_repository_1.notificationRepository.deleteByTaskId(new mongoose_1.Types.ObjectId(userId), taskId, [
                    notification_model_1.NotificationType.SCHEDULED_TASK_ALERT,
                    notification_model_1.NotificationType.DEADLINE_ALERT,
                ]);
                if (deletedCount > 0) {
                    console.log(`[TaskUpdate] Deleted ${deletedCount} old scheduled notifications for task ${taskId} due to scheduledTime change`);
                }
            }
            catch (err) {
                console.error(`[TaskUpdate] Failed to delete old notifications: ${err.message}`);
            }
        }
        if (!updated) {
            throw new Error("TASK_FORBIDDEN");
        }
        // Track completion history when task is marked as completed
        if (dto.status === "completed" && currentTask.status !== "completed") {
            const completedAt = new Date();
            const hour = completedAt.getHours();
            const dayOfWeek = completedAt.getDay();
            // Estimate duration from creation time (simplified)
            const duration = Math.floor((completedAt.getTime() - currentTask.createdAt.getTime()) / (1000 * 60));
            await user_habit_repository_1.userHabitRepository.addCompletionHistory(userId, {
                hour,
                dayOfWeek,
                completed: true,
                duration,
            });
        }
        await invalidateTasksCache(userId);
        const publicTask = toPublicTask(updated);
        // Send invite emails to new guests (don't wait)
        if (dto.guests && dto.guests.length > 0) {
            const previousGuests = (currentTask.guests || []).map((g) => g.toLowerCase());
            sendGuestInvites({ userId, task: publicTask, previousGuests }).catch((err) => {
                console.error("[TaskService] Failed to send guest invites:", err.message);
            });
        }
        return publicTask;
    },
    delete: async (userId, taskId) => {
        const deleted = await task_repository_1.taskRepository.deleteByIdForUser({
            taskId,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!deleted) {
            throw new Error("TASK_FORBIDDEN");
        }
        await invalidateTasksCache(userId);
        return { message: "Xóa task thành công" };
    },
    aiBreakdown: async (userId, taskId) => {
        const task = await task_repository_1.taskRepository.findByIdForUser({
            taskId,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!task) {
            throw new Error("TASK_FORBIDDEN");
        }
        const breakdown = await ai_service_1.aiService.taskBreakdown(userId, {
            title: task.title,
            deadline: task.deadline,
        });
        const updated = await task_repository_1.taskRepository.updateByIdForUser({ taskId, userId: new mongoose_1.Types.ObjectId(userId) }, {
            aiBreakdown: breakdown.steps.map((s) => ({
                title: s.title,
                status: s.status,
                estimatedDuration: s.estimatedDuration,
            })),
            estimatedDuration: breakdown.totalEstimatedDuration,
        });
        if (!updated) {
            throw new Error("TASK_FORBIDDEN");
        }
        await invalidateTasksCache(userId);
        return toPublicTask(updated);
    },
    autoBreakdown: async (userId, taskId) => {
        // Check if user has auto-breakdown enabled
        const userHabits = await user_habit_repository_1.userHabitRepository.findByUserId(userId);
        const autoBreakdownEnabled = userHabits?.aiPreferences?.autoBreakdown ?? true;
        if (!autoBreakdownEnabled) {
            return { breakdown: [], applied: false };
        }
        const task = await task_repository_1.taskRepository.findByIdForUser({
            taskId,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!task) {
            throw new Error("TASK_FORBIDDEN");
        }
        // Only auto-breakdown for complex tasks (high priority or with keywords indicating complexity)
        const isComplex = task.priority === "high" ||
            task.priority === "urgent" ||
            /(phân tích|thiết kế|xây dựng|develop|implement|code|backend|frontend)/i.test(task.title);
        if (!isComplex) {
            return { breakdown: [], applied: false };
        }
        try {
            const breakdown = await ai_service_1.aiService.taskBreakdown(userId, {
                title: task.title,
                deadline: task.deadline,
            });
            await task_repository_1.taskRepository.updateByIdForUser({ taskId, userId: new mongoose_1.Types.ObjectId(userId) }, {
                aiBreakdown: breakdown.steps.map((s) => ({
                    title: s.title,
                    status: s.status,
                    estimatedDuration: s.estimatedDuration,
                })),
                estimatedDuration: breakdown.totalEstimatedDuration,
            });
            await invalidateTasksCache(userId);
            return { breakdown: breakdown.steps, applied: true };
        }
        catch (error) {
            // If AI breakdown fails, return empty but don't throw
            return { breakdown: [], applied: false };
        }
    },
    list: async (userId, params) => {
        const cacheKey = tasksListCacheKey({
            userId,
            status: params.status,
            priority: params.priority,
            keyword: params.keyword,
            deadlineFrom: params.deadlineFrom,
            deadlineTo: params.deadlineTo,
            page: params.page,
            limit: params.limit,
        });
        try {
            const redis = (0, redis_service_1.getRedis)();
            const cached = await redis.get(cacheKey);
            if (cached) {
                return parseCachedTaskList(cached);
            }
        }
        catch (_err) {
            // ignore cache errors
        }
        const { items, total } = await task_repository_1.taskRepository.listByUser({
            userId: new mongoose_1.Types.ObjectId(userId),
            status: params.status,
            priority: params.priority,
            title: params.title,
            deadlineFrom: params.deadlineFrom,
            deadlineTo: params.deadlineTo,
            page: params.page,
            limit: params.limit,
        });
        const result = {
            items: items.map(toPublicTask),
            page: params.page,
            limit: params.limit,
            total,
        };
        try {
            const redis = (0, redis_service_1.getRedis)();
            await redis.set(cacheKey, JSON.stringify(result), "EX", getTasksCacheTtlSeconds());
        }
        catch (_err) {
            // ignore cache errors
        }
        return result;
    },
    overdue: async (userId, params) => {
        const cacheKey = tasksOverdueCacheKey({
            userId,
            page: params.page,
            limit: params.limit,
        });
        try {
            const redis = (0, redis_service_1.getRedis)();
            const cached = await redis.get(cacheKey);
            if (cached) {
                return parseCachedTaskList(cached);
            }
        }
        catch (_err) {
            // ignore cache errors
        }
        const { items, total } = await task_repository_1.taskRepository.listOverdueByUser({
            userId: new mongoose_1.Types.ObjectId(userId),
            now: new Date(),
            page: params.page,
            limit: params.limit,
        });
        const result = {
            items: items.map(toPublicTask),
            page: params.page,
            limit: params.limit,
            total,
        };
        try {
            const redis = (0, redis_service_1.getRedis)();
            await redis.set(cacheKey, JSON.stringify(result), "EX", getTasksCacheTtlSeconds());
        }
        catch (_err) {
            // ignore cache errors
        }
        return result;
    },
    saveAISchedule: async (userId, schedule) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        // Group sessions by taskId to efficiently fetch parent tasks
        const sessionsByTaskId = new Map();
        for (const item of schedule) {
            if (!mongoose_1.Types.ObjectId.isValid(item.taskId))
                continue;
            const list = sessionsByTaskId.get(item.taskId) || [];
            list.push(item);
            sessionsByTaskId.set(item.taskId, list);
        }
        let createdCount = 0;
        let updatedCount = 0;
        for (const [taskId, sessions] of sessionsByTaskId.entries()) {
            // Get parent task info
            const parentTask = await task_repository_1.taskRepository.findByIdForUser({
                taskId,
                userId: new mongoose_1.Types.ObjectId(userId),
            });
            if (!parentTask) {
                console.log(`[SaveAISchedule] Parent task not found: ${taskId}`);
                continue;
            }
            // Mark parent task as having AI schedule (but don't set scheduledTime)
            // The actual sessions are represented by subtasks
            if (parentTask.status === "todo") {
                await task_repository_1.taskRepository.updateByIdForUser({ taskId, userId: new mongoose_1.Types.ObjectId(userId) }, { status: "scheduled" });
                updatedCount++;
            }
            // Create a subtask for each session
            for (let i = 0; i < sessions.length; i++) {
                const session = sessions[i];
                const startTime = session.scheduledTime.start;
                const endTime = session.scheduledTime.end;
                const timeStr = `${startTime.getHours().toString().padStart(2, "0")}:${startTime.getMinutes().toString().padStart(2, "0")}-${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}`;
                const subtaskTitle = sessions.length === 1
                    ? parentTask.title
                    : `${parentTask.title} (Phiên ${i + 1}/${sessions.length})`;
                try {
                    await task_repository_1.taskRepository.create({
                        title: subtaskTitle,
                        description: session.scheduledTime.reason ||
                            `Phiên làm việc ${i + 1} theo lịch AI`,
                        status: "scheduled",
                        priority: parentTask.priority,
                        deadline: parentTask.deadline,
                        tags: [...(parentTask.tags || [])],
                        userId: new mongoose_1.Types.ObjectId(userId),
                        parentTaskId: new mongoose_1.Types.ObjectId(taskId),
                        estimatedDuration: Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60)),
                        scheduledTime: {
                            start: startTime,
                            end: endTime,
                            aiPlanned: true,
                            reason: session.scheduledTime.reason || `Phiên ${i + 1} theo lịch AI`,
                        },
                    });
                    createdCount++;
                    console.log(`[SaveAISchedule] Created subtask "${subtaskTitle}" for ${timeStr}`);
                }
                catch (err) {
                    console.error(`[SaveAISchedule] Failed to create subtask for session ${session.sessionId}: ${err.message}`);
                }
            }
        }
        if (createdCount > 0 || updatedCount > 0) {
            await invalidateTasksCache(userId);
        }
        return { updated: updatedCount, created: createdCount };
    },
    /**
     * Quick update task status (for status dropdown)
     */
    updateStatus: async (userId, taskId, status) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId) || !mongoose_1.Types.ObjectId.isValid(taskId)) {
            throw new Error("INVALID_ID");
        }
        // Get current task to check status change
        const currentTask = await task_repository_1.taskRepository.findByIdForUser({
            taskId,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!currentTask) {
            throw new Error("TASK_FORBIDDEN");
        }
        const updated = await task_repository_1.taskRepository.updateByIdForUser({
            taskId,
            userId: new mongoose_1.Types.ObjectId(userId),
        }, {
            status,
            ...(status === "todo" ? { scheduledTime: null } : {}),
        });
        if (!updated) {
            throw new Error("TASK_FORBIDDEN");
        }
        // Track completion history when task is marked as completed
        if (status === "completed" && currentTask.status !== "completed") {
            const completedAt = new Date();
            const hour = completedAt.getHours();
            const dayOfWeek = completedAt.getDay();
            // Estimate duration from creation time (simplified)
            const duration = Math.floor((completedAt.getTime() - currentTask.createdAt.getTime()) / (1000 * 60));
            await user_habit_repository_1.userHabitRepository.addCompletionHistory(userId, {
                hour,
                dayOfWeek,
                completed: true,
                duration,
            });
        }
        await invalidateTasksCache(userId);
        return toPublicTask(updated);
    },
    /**
     * Clear scheduled time from tasks (when schedule is deleted)
     */
    clearScheduledTime: async (userId, taskIds) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        let updatedCount = 0;
        for (const taskId of taskIds) {
            if (!mongoose_1.Types.ObjectId.isValid(taskId)) {
                continue;
            }
            const updated = await task_repository_1.taskRepository.updateByIdForUser({
                taskId,
                userId: new mongoose_1.Types.ObjectId(userId),
            }, {
                scheduledTime: undefined,
                status: "todo", // Reset status back to todo
            });
            if (updated) {
                console.log(`[Clear Schedule] Task "${updated.title}" scheduledTime cleared and status reset to "todo"`);
                updatedCount++;
            }
        }
        if (updatedCount > 0) {
            await invalidateTasksCache(userId);
        }
        return { updated: updatedCount };
    },
    /**
     * Clear all scheduled times for user (emergency cleanup)
     */
    clearAllScheduledTimes: async (userId) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        // Find all tasks with scheduledTime
        const { items: scheduledTasks } = await task_repository_1.taskRepository.listByUser({
            userId: new mongoose_1.Types.ObjectId(userId),
            page: 1,
            limit: 1000,
        });
        const tasksWithSchedule = scheduledTasks.filter((task) => task.scheduledTime?.start && task.scheduledTime?.end);
        let updatedCount = 0;
        for (const task of tasksWithSchedule) {
            const updated = await task_repository_1.taskRepository.updateByIdForUser({
                taskId: String(task._id),
                userId: new mongoose_1.Types.ObjectId(userId),
            }, {
                scheduledTime: undefined,
                status: task.status === "scheduled" ? "todo" : task.status, // Only reset scheduled tasks to todo
            });
            if (updated) {
                console.log(`[Clear All Schedule] Task "${updated.title}" scheduledTime cleared`);
                updatedCount++;
            }
        }
        if (updatedCount > 0) {
            await invalidateTasksCache(userId);
        }
        return { updated: updatedCount };
    },
    checkScheduleConflicts: async (userId, schedule) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const conflicts = [];
        for (const item of schedule) {
            if (!mongoose_1.Types.ObjectId.isValid(item.taskId)) {
                continue;
            }
            const task = await task_repository_1.taskRepository.findByIdForUser({
                taskId: item.taskId,
                userId: new mongoose_1.Types.ObjectId(userId),
            });
            if (!task) {
                continue;
            }
            // Find conflicting tasks
            const conflictingTasks = await task_repository_1.taskRepository.findConflictingTasks({
                userId: new mongoose_1.Types.ObjectId(userId),
                startTime: item.scheduledTime.start,
                endTime: item.scheduledTime.end,
                excludeTaskId: item.taskId,
            });
            if (conflictingTasks.length > 0) {
                conflicts.push({
                    taskId: item.taskId,
                    taskTitle: task.title,
                    conflictingWith: conflictingTasks.map((t) => ({
                        id: String(t._id),
                        title: t.title,
                        scheduledTime: {
                            start: t.scheduledTime.start,
                            end: t.scheduledTime.end,
                        },
                    })),
                });
            }
        }
        // Also check conflicts within the new schedule itself
        for (let i = 0; i < schedule.length; i++) {
            for (let j = i + 1; j < schedule.length; j++) {
                const taskA = schedule[i];
                const taskB = schedule[j];
                // Check if taskA and taskB overlap
                const aStart = taskA.scheduledTime.start.getTime();
                const aEnd = taskA.scheduledTime.end.getTime();
                const bStart = taskB.scheduledTime.start.getTime();
                const bEnd = taskB.scheduledTime.end.getTime();
                if (aStart < bEnd && aEnd > bStart) {
                    // Find if taskA already has conflicts entry
                    let conflictA = conflicts.find((c) => c.taskId === taskA.taskId);
                    if (!conflictA) {
                        const taskAData = await task_repository_1.taskRepository.findByIdForUser({
                            taskId: taskA.taskId,
                            userId: new mongoose_1.Types.ObjectId(userId),
                        });
                        conflictA = {
                            taskId: taskA.taskId,
                            taskTitle: taskAData?.title || "Unknown",
                            conflictingWith: [],
                        };
                        conflicts.push(conflictA);
                    }
                    // Find if taskB already in conflictingWith
                    const alreadyAdded = conflictA.conflictingWith.some((c) => c.id === taskB.taskId);
                    if (!alreadyAdded) {
                        const taskBData = await task_repository_1.taskRepository.findByIdForUser({
                            taskId: taskB.taskId,
                            userId: new mongoose_1.Types.ObjectId(userId),
                        });
                        conflictA.conflictingWith.push({
                            id: taskB.taskId,
                            title: taskBData?.title || "Unknown",
                            scheduledTime: taskB.scheduledTime,
                        });
                    }
                }
            }
        }
        return {
            conflicts,
            hasConflicts: conflicts.length > 0,
        };
    },
};
