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

  updateById: async (
    taskId: string | Types.ObjectId,
    update: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      deadline?: Date;
      tags?: string[];
      reminderAt?: Date;
      aiBreakdown?: { title: string; status?: TaskStatus }[];
    },
  ): Promise<TaskDoc | null> => {
    return Task.findByIdAndUpdate(
      taskId,
      {
        $set: {
          ...(update.title !== undefined ? { title: update.title } : {}),
          ...(update.description !== undefined
            ? { description: update.description }
            : {}),
          ...(update.status !== undefined ? { status: update.status } : {}),
          ...(update.priority !== undefined
            ? { priority: update.priority }
            : {}),
          ...(update.deadline !== undefined
            ? { deadline: update.deadline }
            : {}),
          ...(update.tags !== undefined ? { tags: update.tags } : {}),
          ...(update.reminderAt !== undefined
            ? { reminderAt: update.reminderAt }
            : {}),
          ...(update.aiBreakdown !== undefined
            ? { aiBreakdown: update.aiBreakdown }
            : {}),
        },
      },
      { new: true },
    ).exec();
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
