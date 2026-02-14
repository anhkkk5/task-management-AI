import { Types } from "mongoose";
import { Task, TaskAttrs, TaskDoc } from "./task.model";

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

  findById: async (taskId: string | Types.ObjectId): Promise<TaskDoc | null> => {
    return Task.findById(taskId).exec();
  },
};
