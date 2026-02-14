import { Types } from "mongoose";
import { taskRepository } from "./task.repository";
import {
  CreateTaskDto,
  TaskPriority,
  TaskStatus,
  UpdateTaskDto,
} from "./task.dto";

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

    return toPublicTask(doc);
  },

  getById: async (taskId: string): Promise<PublicTask> => {
    const doc = await taskRepository.findById(taskId);
    if (!doc) {
      throw new Error("TASK_NOT_FOUND");
    }
    return toPublicTask(doc);
  },

  update: async (taskId: string, dto: UpdateTaskDto): Promise<PublicTask> => {
    const title = dto.title !== undefined ? dto.title.trim() : undefined;
    if (title !== undefined && title.length === 0) {
      throw new Error("INVALID_TITLE");
    }

    const updated = await taskRepository.updateById(taskId, {
      title,
      description: dto.description,
      status: dto.status,
      priority: dto.priority,
      deadline: dto.deadline,
      tags: dto.tags,
      reminderAt: dto.reminderAt,
      aiBreakdown: dto.aiBreakdown,
    });

    if (!updated) {
      throw new Error("TASK_NOT_FOUND");
    }

    return toPublicTask(updated);
  },

  delete: async (taskId: string): Promise<{ message: string }> => {
    const deleted = await taskRepository.deleteById(taskId);
    if (!deleted) {
      throw new Error("TASK_NOT_FOUND");
    }
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
    const { items, total } = await taskRepository.listByUser({
      userId: new Types.ObjectId(userId),
      status: params.status,
      priority: params.priority,
      deadlineFrom: params.deadlineFrom,
      deadlineTo: params.deadlineTo,
      page: params.page,
      limit: params.limit,
    });

    return {
      items: items.map(toPublicTask),
      page: params.page,
      limit: params.limit,
      total,
    };
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
    const { items, total } = await taskRepository.listOverdueByUser({
      userId: new Types.ObjectId(userId),
      now: new Date(),
      page: params.page,
      limit: params.limit,
    });

    return {
      items: items.map(toPublicTask),
      page: params.page,
      limit: params.limit,
      total,
    };
  },
};
