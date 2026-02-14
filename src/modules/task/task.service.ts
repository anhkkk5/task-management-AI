import { Types } from "mongoose";
import { taskRepository } from "./task.repository";
import { CreateTaskDto } from "./task.dto";

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
};
