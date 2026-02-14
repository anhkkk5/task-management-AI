import { Types } from "mongoose";
import { Task, TaskAttrs, TaskDoc } from "./task.model";
import { TaskPriority, TaskStatus } from "./task.dto";

export const taskRepository = {
  create: async (attrs: TaskAttrs): Promise<TaskDoc> => {
    return Task.create({
      title: attrs.title,
      description: attrs.description,
      status: attrs.status ?? "todo",
      priority: attrs.priority ?? "medium",
      deadline: attrs.deadline,
      tags: attrs.tags ?? [],
      userId: attrs.userId,
      aiBreakdown: attrs.aiBreakdown ?? [],
      reminderAt: attrs.reminderAt,
    });
  },

  findById: async (
    taskId: string | Types.ObjectId,
  ): Promise<TaskDoc | null> => {
    return Task.findById(taskId).exec();
  },

  listByUser: async (params: {
    userId: string | Types.ObjectId;
    status?: TaskStatus;
    priority?: TaskPriority;
    deadlineFrom?: Date;
    deadlineTo?: Date;
    page: number;
    limit: number;
  }): Promise<{ items: TaskDoc[]; total: number }> => {
    const filter: Record<string, unknown> = {
      userId: params.userId,
    };

    if (params.status) {
      filter.status = params.status;
    }
    if (params.priority) {
      filter.priority = params.priority;
    }
    if (params.deadlineFrom || params.deadlineTo) {
      filter.deadline = {
        ...(params.deadlineFrom ? { $gte: params.deadlineFrom } : {}),
        ...(params.deadlineTo ? { $lte: params.deadlineTo } : {}),
      };
    }

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await Promise.all([
      Task.find(filter)
        .sort({ deadline: 1, updatedAt: -1 })
        .skip(skip)
        .limit(params.limit)
        .exec(),
      Task.countDocuments(filter).exec(),
    ]);

    return { items, total };
  },

  listOverdueByUser: async (params: {
    userId: string | Types.ObjectId;
    now: Date;
    page: number;
    limit: number;
  }): Promise<{ items: TaskDoc[]; total: number }> => {
    const filter: Record<string, unknown> = {
      userId: params.userId,
      deadline: { $lt: params.now },
      status: { $nin: ["completed", "cancelled"] },
    };

    const skip = (params.page - 1) * params.limit;
    const [items, total] = await Promise.all([
      Task.find(filter)
        .sort({ deadline: 1, updatedAt: -1 })
        .skip(skip)
        .limit(params.limit)
        .exec(),
      Task.countDocuments(filter).exec(),
    ]);

    return { items, total };
  },
};
