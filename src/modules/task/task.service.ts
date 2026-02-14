import { Types } from "mongoose";
import { taskRepository } from "./task.repository";
import {
  CreateTaskDto,
  TaskPriority,
  TaskStatus,
  UpdateTaskDto,
} from "./task.dto";
import { getRedis } from "../../services/redis.service";

export type PublicTask = {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  deadline?: Date;
  tags: string[];
  userId: string;
  aiBreakdown: { title: string; status: string }[];
  reminderAt?: Date;
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
    aiBreakdown: (t.aiBreakdown ?? []).map((x: any) => ({
      title: x.title,
      status: x.status,
    })),
    reminderAt: t.reminderAt,
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
  deadlineFrom?: Date;
  deadlineTo?: Date;
  page: number;
  limit: number;
}): string => {
  const parts = [
    `tasks:user:${params.userId}`,
    `status=${params.status ?? ""}`,
    `priority=${params.priority ?? ""}`,
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
      "deadline" | "reminderAt" | "createdAt" | "updatedAt"
    > & {
      deadline?: string;
      reminderAt?: string;
      createdAt: string;
      updatedAt: string;
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

    const doc = await taskRepository.create({
      title,
      description: dto.description,
      deadline: dto.deadline,
      priority: dto.priority,
      tags: dto.tags,
      userId: new Types.ObjectId(userId),
      reminderAt: dto.reminderAt,
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
      },
    );

    if (!updated) {
      throw new Error("TASK_FORBIDDEN");
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

  list: async (
    userId: string,
    params: {
      status?: TaskStatus;
      priority?: TaskPriority;
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
};
