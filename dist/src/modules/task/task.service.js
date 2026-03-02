"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskService = void 0;
const mongoose_1 = require("mongoose");
const task_repository_1 = require("./task.repository");
const redis_service_1 = require("../../services/redis.service");
const ai_service_1 = require("../ai/ai.service");
const user_habit_repository_1 = require("../user/user-habit.repository");
const toPublicTask = (t) => {
    return {
        id: String(t._id),
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        deadline: t.deadline,
        tags: t.tags ?? [],
        userId: String(t.userId),
        parentTaskId: t.parentTaskId ? String(t.parentTaskId) : undefined,
        aiBreakdown: (t.aiBreakdown ?? []).map((x) => ({
            title: x.title,
            status: x.status,
            estimatedDuration: x.estimatedDuration,
        })),
        estimatedDuration: t.estimatedDuration,
        scheduledTime: t.scheduledTime,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
    };
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
            deadline: dto.deadline,
            priority: dto.priority,
            tags: dto.tags,
            userId: new mongoose_1.Types.ObjectId(userId),
            reminderAt: dto.reminderAt,
            estimatedDuration: dto.estimatedDuration,
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
        return toPublicTask(doc);
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
            status: dto.status,
            priority: dto.priority,
            deadline: dto.deadline,
            tags: dto.tags,
            reminderAt: dto.reminderAt,
            aiBreakdown: dto.aiBreakdown,
            estimatedDuration: dto.estimatedDuration,
            scheduledTime: dto.scheduledTime,
        });
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
        return toPublicTask(updated);
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
        let updatedCount = 0;
        let createdCount = 0;
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
            const durationMinutes = Math.max(0, Math.floor((item.scheduledTime.end.getTime() -
                item.scheduledTime.start.getTime()) /
                (1000 * 60)));
            if (item.createSubtask) {
                const subtaskTitle = `${String(task.title)} - ${String(item.title ?? "")}`
                    .trim()
                    .replace(/\s+-\s*$/, "");
                await task_repository_1.taskRepository.create({
                    title: subtaskTitle,
                    description: undefined,
                    status: "todo",
                    priority: task.priority,
                    deadline: task.deadline,
                    tags: task.tags ?? [],
                    userId: new mongoose_1.Types.ObjectId(userId),
                    parentTaskId: task._id,
                    estimatedDuration: durationMinutes || task.estimatedDuration,
                    reminderAt: undefined,
                    scheduledTime: {
                        start: item.scheduledTime.start,
                        end: item.scheduledTime.end,
                        aiPlanned: true,
                        reason: item.scheduledTime.reason,
                    },
                });
                createdCount++;
                continue;
            }
            await task_repository_1.taskRepository.updateByIdForUser({
                taskId: item.taskId,
                userId: new mongoose_1.Types.ObjectId(userId),
            }, {
                scheduledTime: {
                    start: item.scheduledTime.start,
                    end: item.scheduledTime.end,
                    aiPlanned: item.scheduledTime.aiPlanned,
                    reason: item.scheduledTime.reason,
                },
            });
            updatedCount++;
        }
        if (updatedCount > 0 || createdCount > 0) {
            await invalidateTasksCache(userId);
        }
        return { updated: updatedCount, created: createdCount };
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
