import { Types } from "mongoose";
import { taskRepository } from "./task.repository";
import {
  CreateTaskDto,
  TaskPriority,
  TaskStatus,
  UpdateTaskDto,
} from "./task.dto";
import { getRedis } from "../../services/redis.service";
import { aiService } from "../ai/ai.service";
import { userHabitRepository } from "../user/user-habit.repository";

export type PublicTask = {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  deadline?: Date;
  tags: string[];
  userId: string;
  parentTaskId?: string;
  aiBreakdown: { title: string; status: string; estimatedDuration?: number }[];
  estimatedDuration?: number;
  dailyTargetDuration?: number; // Max minutes per day
  dailyTargetMin?: number; // Min minutes per day
  reminderAt?: Date;
  scheduledTime?: {
    start: Date;
    end: Date;
    aiPlanned: boolean;
    reason?: string;
  };
  createdAt: Date;
  updatedAt: Date;
};

const toPublicTask = (t: any): PublicTask => {
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
    aiBreakdown: (t.aiBreakdown ?? []).map((x: any) => ({
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

type TaskListResult = {
  items: PublicTask[];
  page: number;
  limit: number;
  total: number;
};

const tasksListCacheKey = (params: {
  userId: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  keyword?: string;
  deadlineFrom?: Date;
  deadlineTo?: Date;
  page: number;
  limit: number;
}): string => {
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

const tasksOverdueCacheKey = (params: {
  userId: string;
  page: number;
  limit: number;
}): string => {
  return `tasks:user:${params.userId}:overdue:page=${params.page}:limit=${params.limit}`;
};

const getTasksCacheTtlSeconds = (): number => {
  const min = 60;
  const max = 180;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const parseCachedTaskList = (raw: string): TaskListResult => {
  const obj = JSON.parse(raw) as Omit<TaskListResult, "items"> & {
    items: (Omit<
      PublicTask,
      | "deadline"
      | "reminderAt"
      | "createdAt"
      | "updatedAt"
      | "dailyTargetDuration"
      | "dailyTargetMin"
    > & {
      deadline?: string;
      reminderAt?: string;
      createdAt: string;
      updatedAt: string;
      dailyTargetDuration?: number;
      dailyTargetMin?: number;
    })[];
  };

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

const invalidateTasksCache = async (userId: string): Promise<void> => {
  try {
    const redis = getRedis();
    const prefix = `tasks:user:${userId}`;
    const keys: string[] = [];

    let cursor = "0";
    do {
      const [next, batch] = await redis.scan(
        cursor,
        "MATCH",
        `${prefix}*`,
        "COUNT",
        200,
      );
      cursor = next;
      if (Array.isArray(batch) && batch.length) {
        keys.push(...batch);
      }
    } while (cursor !== "0");

    if (keys.length) {
      await redis.del(...keys);
    }
  } catch (_err) {
    return;
  }
};

export const taskService = {
  create: async (userId: string, dto: CreateTaskDto): Promise<PublicTask> => {
    const title = dto.title?.trim();
    if (!title) {
      throw new Error("INVALID_TITLE");
    }

    const parentTaskId = dto.parentTaskId
      ? new Types.ObjectId(dto.parentTaskId)
      : undefined;

    const doc = await taskRepository.create({
      title,
      description: dto.description,
      deadline: dto.deadline,
      priority: dto.priority,
      tags: dto.tags,
      userId: new Types.ObjectId(userId),
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
    taskService.autoBreakdown(userId, String(doc._id)).catch((error) => {
      console.error("[AutoBreakdown] Failed for task:", doc._id, error.message);
    });

    await invalidateTasksCache(userId);

    return toPublicTask(doc);
  },

  getById: async (userId: string, taskId: string): Promise<PublicTask> => {
    const doc = await taskRepository.findByIdForUser({
      taskId,
      userId: new Types.ObjectId(userId),
    });
    if (!doc) {
      throw new Error("TASK_FORBIDDEN");
    }
    return toPublicTask(doc);
  },

  update: async (
    userId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<PublicTask> => {
    const title = dto.title !== undefined ? dto.title.trim() : undefined;
    if (title !== undefined && title.length === 0) {
      throw new Error("INVALID_TITLE");
    }

    // Get current task to check status change
    const currentTask = await taskRepository.findByIdForUser({
      taskId,
      userId: new Types.ObjectId(userId),
    });

    if (!currentTask) {
      throw new Error("TASK_FORBIDDEN");
    }

    const updated = await taskRepository.updateByIdForUser(
      {
        taskId,
        userId: new Types.ObjectId(userId),
      },
      {
        title,
        description: dto.description,
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
      },
    );

    if (!updated) {
      throw new Error("TASK_FORBIDDEN");
    }

    // Track completion history when task is marked as completed
    if (dto.status === "completed" && currentTask.status !== "completed") {
      const completedAt = new Date();
      const hour = completedAt.getHours();
      const dayOfWeek = completedAt.getDay();
      // Estimate duration from creation time (simplified)
      const duration = Math.floor(
        (completedAt.getTime() - currentTask.createdAt.getTime()) / (1000 * 60),
      );

      await userHabitRepository.addCompletionHistory(userId, {
        hour,
        dayOfWeek,
        completed: true,
        duration,
      });
    }

    await invalidateTasksCache(userId);

    return toPublicTask(updated);
  },

  delete: async (
    userId: string,
    taskId: string,
  ): Promise<{ message: string }> => {
    const deleted = await taskRepository.deleteByIdForUser({
      taskId,
      userId: new Types.ObjectId(userId),
    });
    if (!deleted) {
      throw new Error("TASK_FORBIDDEN");
    }

    await invalidateTasksCache(userId);
    return { message: "Xóa task thành công" };
  },

  aiBreakdown: async (userId: string, taskId: string): Promise<PublicTask> => {
    const task = await taskRepository.findByIdForUser({
      taskId,
      userId: new Types.ObjectId(userId),
    });
    if (!task) {
      throw new Error("TASK_FORBIDDEN");
    }

    const breakdown = await aiService.taskBreakdown(userId, {
      title: task.title,
      deadline: task.deadline,
    });

    const updated = await taskRepository.updateByIdForUser(
      { taskId, userId: new Types.ObjectId(userId) },
      {
        aiBreakdown: breakdown.steps.map((s) => ({
          title: s.title,
          status: s.status as any,
          estimatedDuration: s.estimatedDuration,
        })),
        estimatedDuration: breakdown.totalEstimatedDuration,
      },
    );

    if (!updated) {
      throw new Error("TASK_FORBIDDEN");
    }

    await invalidateTasksCache(userId);
    return toPublicTask(updated);
  },

  autoBreakdown: async (
    userId: string,
    taskId: string,
  ): Promise<{
    breakdown: { title: string; status: string; estimatedDuration?: number }[];
    applied: boolean;
  }> => {
    // Check if user has auto-breakdown enabled
    const userHabits = await userHabitRepository.findByUserId(userId);
    const autoBreakdownEnabled =
      userHabits?.aiPreferences?.autoBreakdown ?? true;

    if (!autoBreakdownEnabled) {
      return { breakdown: [], applied: false };
    }

    const task = await taskRepository.findByIdForUser({
      taskId,
      userId: new Types.ObjectId(userId),
    });

    if (!task) {
      throw new Error("TASK_FORBIDDEN");
    }

    // Only auto-breakdown for complex tasks (high priority or with keywords indicating complexity)
    const isComplex =
      task.priority === "high" ||
      task.priority === "urgent" ||
      /(phân tích|thiết kế|xây dựng|develop|implement|code|backend|frontend)/i.test(
        task.title,
      );

    if (!isComplex) {
      return { breakdown: [], applied: false };
    }

    try {
      const breakdown = await aiService.taskBreakdown(userId, {
        title: task.title,
        deadline: task.deadline,
      });

      await taskRepository.updateByIdForUser(
        { taskId, userId: new Types.ObjectId(userId) },
        {
          aiBreakdown: breakdown.steps.map((s) => ({
            title: s.title,
            status: s.status as any,
            estimatedDuration: s.estimatedDuration,
          })),
          estimatedDuration: breakdown.totalEstimatedDuration,
        },
      );

      await invalidateTasksCache(userId);
      return { breakdown: breakdown.steps, applied: true };
    } catch (error) {
      // If AI breakdown fails, return empty but don't throw
      return { breakdown: [], applied: false };
    }
  },

  list: async (
    userId: string,
    params: {
      status?: TaskStatus;
      priority?: TaskPriority;
      title?: RegExp;
      keyword?: string;
      deadlineFrom?: Date;
      deadlineTo?: Date;
      page: number;
      limit: number;
    },
  ): Promise<{
    items: PublicTask[];
    page: number;
    limit: number;
    total: number;
  }> => {
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
      const redis = getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return parseCachedTaskList(cached);
      }
    } catch (_err) {
      // ignore cache errors
    }

    const { items, total } = await taskRepository.listByUser({
      userId: new Types.ObjectId(userId),
      status: params.status,
      priority: params.priority,
      title: params.title,
      deadlineFrom: params.deadlineFrom,
      deadlineTo: params.deadlineTo,
      page: params.page,
      limit: params.limit,
    });

    const result: TaskListResult = {
      items: items.map(toPublicTask),
      page: params.page,
      limit: params.limit,
      total,
    };

    try {
      const redis = getRedis();
      await redis.set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        getTasksCacheTtlSeconds(),
      );
    } catch (_err) {
      // ignore cache errors
    }

    return result;
  },

  overdue: async (
    userId: string,
    params: { page: number; limit: number },
  ): Promise<{
    items: PublicTask[];
    page: number;
    limit: number;
    total: number;
  }> => {
    const cacheKey = tasksOverdueCacheKey({
      userId,
      page: params.page,
      limit: params.limit,
    });

    try {
      const redis = getRedis();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return parseCachedTaskList(cached);
      }
    } catch (_err) {
      // ignore cache errors
    }

    const { items, total } = await taskRepository.listOverdueByUser({
      userId: new Types.ObjectId(userId),
      now: new Date(),
      page: params.page,
      limit: params.limit,
    });

    const result: TaskListResult = {
      items: items.map(toPublicTask),
      page: params.page,
      limit: params.limit,
      total,
    };

    try {
      const redis = getRedis();
      await redis.set(
        cacheKey,
        JSON.stringify(result),
        "EX",
        getTasksCacheTtlSeconds(),
      );
    } catch (_err) {
      // ignore cache errors
    }

    return result;
  },

  saveAISchedule: async (
    userId: string,
    schedule: {
      sessionId?: string;
      taskId: string;
      title?: string;
      createSubtask?: boolean;
      scheduledTime: {
        start: Date;
        end: Date;
        aiPlanned: boolean;
        reason: string;
      };
    }[],
  ): Promise<{ updated: number; created: number }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    let updatedCount = 0;

    for (const item of schedule) {
      if (!Types.ObjectId.isValid(item.taskId)) {
        continue;
      }

      const task = await taskRepository.findByIdForUser({
        taskId: item.taskId,
        userId: new Types.ObjectId(userId),
      });

      if (!task) {
        continue;
      }

      // Update task gốc với status "scheduled" và scheduledTime
      // KHÔNG tạo subtasks - AISchedule collection sẽ lưu sessions
      const updated = await taskRepository.updateByIdForUser(
        {
          taskId: item.taskId,
          userId: new Types.ObjectId(userId),
        },
        {
          status: "scheduled",
          scheduledTime: {
            start: item.scheduledTime.start,
            end: item.scheduledTime.end,
            aiPlanned: item.scheduledTime.aiPlanned,
            reason: item.scheduledTime.reason,
          },
        },
      );

      if (updated) {
        console.log(
          `[Save Schedule] Task "${updated.title}" status updated to "scheduled" with time ${item.scheduledTime.start} - ${item.scheduledTime.end}`,
        );
      }

      updatedCount++;
    }

    if (updatedCount > 0) {
      await invalidateTasksCache(userId);
    }

    return { updated: updatedCount, created: 0 };
  },

  /**
   * Quick update task status (for status dropdown)
   */
  updateStatus: async (
    userId: string,
    taskId: string,
    status: TaskStatus,
  ): Promise<PublicTask> => {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(taskId)) {
      throw new Error("INVALID_ID");
    }

    // Get current task to check status change
    const currentTask = await taskRepository.findByIdForUser({
      taskId,
      userId: new Types.ObjectId(userId),
    });

    if (!currentTask) {
      throw new Error("TASK_FORBIDDEN");
    }

    const updated = await taskRepository.updateByIdForUser(
      {
        taskId,
        userId: new Types.ObjectId(userId),
      },
      {
        status,
        ...(status === "todo" ? { scheduledTime: null } : {}),
      },
    );

    if (!updated) {
      throw new Error("TASK_FORBIDDEN");
    }

    // Track completion history when task is marked as completed
    if (status === "completed" && currentTask.status !== "completed") {
      const completedAt = new Date();
      const hour = completedAt.getHours();
      const dayOfWeek = completedAt.getDay();
      // Estimate duration from creation time (simplified)
      const duration = Math.floor(
        (completedAt.getTime() - currentTask.createdAt.getTime()) / (1000 * 60),
      );

      await userHabitRepository.addCompletionHistory(userId, {
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
  clearScheduledTime: async (
    userId: string,
    taskIds: string[],
  ): Promise<{ updated: number }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    let updatedCount = 0;

    for (const taskId of taskIds) {
      if (!Types.ObjectId.isValid(taskId)) {
        continue;
      }

      const updated = await taskRepository.updateByIdForUser(
        {
          taskId,
          userId: new Types.ObjectId(userId),
        },
        {
          scheduledTime: undefined,
          status: "todo", // Reset status back to todo
        },
      );

      if (updated) {
        console.log(
          `[Clear Schedule] Task "${updated.title}" scheduledTime cleared and status reset to "todo"`,
        );
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
  clearAllScheduledTimes: async (
    userId: string,
  ): Promise<{ updated: number }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    // Find all tasks with scheduledTime
    const { items: scheduledTasks } = await taskRepository.listByUser({
      userId: new Types.ObjectId(userId),
      page: 1,
      limit: 1000,
    });

    const tasksWithSchedule = scheduledTasks.filter(
      (task) => task.scheduledTime?.start && task.scheduledTime?.end,
    );

    let updatedCount = 0;

    for (const task of tasksWithSchedule) {
      const updated = await taskRepository.updateByIdForUser(
        {
          taskId: String(task._id),
          userId: new Types.ObjectId(userId),
        },
        {
          scheduledTime: undefined,
          status: task.status === "scheduled" ? "todo" : task.status, // Only reset scheduled tasks to todo
        },
      );

      if (updated) {
        console.log(
          `[Clear All Schedule] Task "${updated.title}" scheduledTime cleared`,
        );
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      await invalidateTasksCache(userId);
    }

    return { updated: updatedCount };
  },

  checkScheduleConflicts: async (
    userId: string,
    schedule: {
      taskId: string;
      scheduledTime: {
        start: Date;
        end: Date;
      };
    }[],
  ): Promise<{
    conflicts: {
      taskId: string;
      taskTitle: string;
      conflictingWith: {
        id: string;
        title: string;
        scheduledTime: { start: Date; end: Date };
      }[];
    }[];
    hasConflicts: boolean;
  }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    const conflicts: {
      taskId: string;
      taskTitle: string;
      conflictingWith: {
        id: string;
        title: string;
        scheduledTime: { start: Date; end: Date };
      }[];
    }[] = [];

    for (const item of schedule) {
      if (!Types.ObjectId.isValid(item.taskId)) {
        continue;
      }

      const task = await taskRepository.findByIdForUser({
        taskId: item.taskId,
        userId: new Types.ObjectId(userId),
      });

      if (!task) {
        continue;
      }

      // Find conflicting tasks
      const conflictingTasks = await taskRepository.findConflictingTasks({
        userId: new Types.ObjectId(userId),
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
              start: t.scheduledTime!.start,
              end: t.scheduledTime!.end,
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
            const taskAData = await taskRepository.findByIdForUser({
              taskId: taskA.taskId,
              userId: new Types.ObjectId(userId),
            });
            conflictA = {
              taskId: taskA.taskId,
              taskTitle: taskAData?.title || "Unknown",
              conflictingWith: [],
            };
            conflicts.push(conflictA);
          }

          // Find if taskB already in conflictingWith
          const alreadyAdded = conflictA.conflictingWith.some(
            (c) => c.id === taskB.taskId,
          );
          if (!alreadyAdded) {
            const taskBData = await taskRepository.findByIdForUser({
              taskId: taskB.taskId,
              userId: new Types.ObjectId(userId),
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
