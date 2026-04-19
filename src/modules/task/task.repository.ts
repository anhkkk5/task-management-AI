import { Types } from "mongoose";
import { Task, TaskAttrs, TaskDoc } from "./task.model";
import { TaskPriority, TaskStatus } from "./task.dto";

export const taskRepository = {
  create: async (attrs: TaskAttrs): Promise<TaskDoc> => {
    return Task.create({
      title: attrs.title,
      description: attrs.description,
      type: attrs.type,
      allDay: attrs.allDay,
      guests: attrs.guests ?? [],
      guestDetails: attrs.guestDetails ?? [],
      location: attrs.location,
      visibility: attrs.visibility,
      reminderMinutes: attrs.reminderMinutes,
      recurrence: attrs.recurrence,
      meetingLink: attrs.meetingLink,
      status: attrs.status ?? "todo",
      priority: attrs.priority ?? "medium",
      deadline: attrs.deadline,
      tags: attrs.tags ?? [],
      userId: attrs.userId,
      parentTaskId: attrs.parentTaskId,
      aiBreakdown: attrs.aiBreakdown ?? [],
      estimatedDuration: attrs.estimatedDuration,
      dailyTargetDuration: attrs.dailyTargetDuration,
      dailyTargetMin: attrs.dailyTargetMin,
      reminderAt: attrs.reminderAt,
      scheduledTime: attrs.scheduledTime,
    });
  },

  findById: async (
    taskId: string | Types.ObjectId,
  ): Promise<TaskDoc | null> => {
    return Task.findById(taskId).exec();
  },

  findByIdForUser: async (params: {
    taskId: string | Types.ObjectId;
    userId: string | Types.ObjectId;
  }): Promise<TaskDoc | null> => {
    return Task.findOne({ _id: params.taskId, userId: params.userId }).exec();
  },

  updateById: async (
    taskId: string | Types.ObjectId,
    update: {
      title?: string;
      description?: string;
      type?: "event" | "todo" | "appointment";
      allDay?: boolean;
      guests?: string[];
      guestDetails?: Array<{
        guestId: string | Types.ObjectId;
        email: string;
        name: string;
        avatar?: string;
        permission: "edit_event" | "view_guest_list" | "invite_others";
        status?: "pending" | "accepted" | "declined";
      }>;
      location?: string;
      visibility?: "default" | "public" | "private";
      reminderMinutes?: number | null;
      recurrence?: string;
      meetingLink?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      deadline?: Date;
      tags?: string[];
      reminderAt?: Date;
      aiBreakdown?: {
        title: string;
        status?: TaskStatus;
        estimatedDuration?: number;
        difficulty?: "easy" | "medium" | "hard";
        description?: string;
        scheduledDate?: string;
        scheduledTime?: string;
      }[];
      estimatedDuration?: number;
      dailyTargetDuration?: number;
      dailyTargetMin?: number;
      scheduledTime?: {
        start: Date;
        end: Date;
        aiPlanned: boolean;
        reason?: string;
      };
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
          ...(update.type !== undefined ? { type: update.type } : {}),
          ...(update.allDay !== undefined ? { allDay: update.allDay } : {}),
          ...(update.guests !== undefined ? { guests: update.guests } : {}),
          ...(update.guestDetails !== undefined
            ? { guestDetails: update.guestDetails }
            : {}),
          ...(update.location !== undefined
            ? { location: update.location }
            : {}),
          ...(update.visibility !== undefined
            ? { visibility: update.visibility }
            : {}),
          ...(update.reminderMinutes !== undefined
            ? { reminderMinutes: update.reminderMinutes }
            : {}),
          ...(update.recurrence !== undefined
            ? { recurrence: update.recurrence }
            : {}),
          ...(update.meetingLink !== undefined
            ? { meetingLink: update.meetingLink }
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
          ...(update.estimatedDuration !== undefined
            ? { estimatedDuration: update.estimatedDuration }
            : {}),
          ...(update.dailyTargetDuration !== undefined
            ? { dailyTargetDuration: update.dailyTargetDuration }
            : {}),
          ...(update.dailyTargetMin !== undefined
            ? { dailyTargetMin: update.dailyTargetMin }
            : {}),
          ...(update.scheduledTime !== undefined
            ? { scheduledTime: update.scheduledTime }
            : {}),
        },
      },
      { new: true },
    ).exec();
  },

  updateByIdForUser: async (
    params: {
      taskId: string | Types.ObjectId;
      userId: string | Types.ObjectId;
    },
    update: {
      title?: string;
      description?: string;
      type?: "event" | "todo" | "appointment";
      allDay?: boolean;
      guests?: string[];
      guestDetails?: Array<{
        guestId: string | Types.ObjectId;
        email: string;
        name: string;
        avatar?: string;
        permission: "edit_event" | "view_guest_list" | "invite_others";
        status?: "pending" | "accepted" | "declined";
      }>;
      location?: string;
      visibility?: "default" | "public" | "private";
      reminderMinutes?: number | null;
      recurrence?: string;
      meetingLink?: string;
      status?: TaskStatus;
      priority?: TaskPriority;
      deadline?: Date;
      tags?: string[];
      reminderAt?: Date;
      aiBreakdown?: {
        title: string;
        status?: TaskStatus;
        estimatedDuration?: number;
        difficulty?: "easy" | "medium" | "hard";
        description?: string;
        scheduledDate?: string;
        scheduledTime?: string;
      }[];
      estimatedDuration?: number;
      dailyTargetDuration?: number;
      dailyTargetMin?: number;
      scheduledTime?: {
        start: Date;
        end: Date;
        aiPlanned: boolean;
        reason?: string;
      } | null;
    },
  ): Promise<TaskDoc | null> => {
    return Task.findOneAndUpdate(
      { _id: params.taskId, userId: params.userId },
      {
        $set: {
          ...(update.title !== undefined ? { title: update.title } : {}),
          ...(update.description !== undefined
            ? { description: update.description }
            : {}),
          ...(update.type !== undefined ? { type: update.type } : {}),
          ...(update.allDay !== undefined ? { allDay: update.allDay } : {}),
          ...(update.guests !== undefined ? { guests: update.guests } : {}),
          ...(update.guestDetails !== undefined
            ? { guestDetails: update.guestDetails }
            : {}),
          ...(update.location !== undefined
            ? { location: update.location }
            : {}),
          ...(update.visibility !== undefined
            ? { visibility: update.visibility }
            : {}),
          ...(update.reminderMinutes !== undefined
            ? { reminderMinutes: update.reminderMinutes }
            : {}),
          ...(update.recurrence !== undefined
            ? { recurrence: update.recurrence }
            : {}),
          ...(update.meetingLink !== undefined
            ? { meetingLink: update.meetingLink }
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
          ...(update.estimatedDuration !== undefined
            ? { estimatedDuration: update.estimatedDuration }
            : {}),
          ...(update.dailyTargetDuration !== undefined
            ? { dailyTargetDuration: update.dailyTargetDuration }
            : {}),
          ...(update.dailyTargetMin !== undefined
            ? { dailyTargetMin: update.dailyTargetMin }
            : {}),
          ...(update.scheduledTime !== undefined
            ? { scheduledTime: update.scheduledTime }
            : {}),
        },
      },
      { new: true },
    ).exec();
  },

  deleteById: async (
    taskId: string | Types.ObjectId,
  ): Promise<TaskDoc | null> => {
    return Task.findByIdAndDelete(taskId).exec();
  },

  deleteByIdForUser: async (params: {
    taskId: string | Types.ObjectId;
    userId: string | Types.ObjectId;
  }): Promise<TaskDoc | null> => {
    return Task.findOneAndDelete({
      _id: params.taskId,
      userId: params.userId,
    }).exec();
  },

  deleteManyByParentTaskId: async (params: {
    parentTaskId: string | Types.ObjectId;
    userId: string | Types.ObjectId;
  }): Promise<number> => {
    const result = await Task.deleteMany({
      parentTaskId: params.parentTaskId,
      userId: params.userId,
    }).exec();
    return result.deletedCount || 0;
  },

  listByUser: async (params: {
    userId: string | Types.ObjectId;
    status?: TaskStatus;
    priority?: TaskPriority;
    title?: RegExp;
    deadlineFrom?: Date;
    deadlineTo?: Date;
    page: number;
    limit: number;
  }): Promise<{ items: TaskDoc[]; total: number }> => {
    const filter: Record<string, unknown> = {
      userId: params.userId,
      isArchived: { $ne: true },
      parentTaskId: { $exists: false }, // Chỉ lấy task cha, không lấy subtask
    };

    if (params.status) {
      filter.status = params.status;
    }
    if (params.priority) {
      filter.priority = params.priority;
    }
    if (params.title) {
      filter.title = params.title;
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
      isArchived: { $ne: true },
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

  // Find tasks with overlapping scheduled time
  findConflictingTasks: async (params: {
    userId: string | Types.ObjectId;
    startTime: Date;
    endTime: Date;
    excludeTaskId?: string;
  }): Promise<TaskDoc[]> => {
    const filter: Record<string, unknown> = {
      userId: params.userId,
      "scheduledTime.start": { $exists: true, $ne: null },
      "scheduledTime.end": { $exists: true, $ne: null },
      status: { $nin: ["completed", "cancelled"] },
    };

    // Exclude specific task if provided (for update scenario)
    if (params.excludeTaskId) {
      filter._id = { $ne: new Types.ObjectId(params.excludeTaskId) };
    }

    // Find tasks where scheduled time overlaps with the given time range
    // Overlap condition: (taskStart < givenEnd) AND (taskEnd > givenStart)
    filter.$and = [
      { "scheduledTime.start": { $lt: params.endTime } },
      { "scheduledTime.end": { $gt: params.startTime } },
    ];

    return Task.find(filter).exec();
  },

  // Get scheduled tasks for conflict detection
  getScheduledTasks: async (params: {
    userId: string | Types.ObjectId;
    startDate: Date;
    endDate: Date;
    excludeTaskIds?: string[];
  }): Promise<TaskDoc[]> => {
    const filter: any = {
      userId: params.userId,
      status: { $in: ["scheduled", "in_progress"] },
      "scheduledTime.start": { $exists: true, $ne: null },
      "scheduledTime.end": { $exists: true, $ne: null },
      // Task phải overlap với range [startDate, endDate]
      // Overlap condition: taskStart < endDate AND taskEnd > startDate
      $and: [
        { "scheduledTime.start": { $lt: params.endDate } },
        { "scheduledTime.end": { $gt: params.startDate } },
      ],
    };

    // Exclude specific tasks (e.g., tasks being scheduled)
    if (params.excludeTaskIds && params.excludeTaskIds.length > 0) {
      filter._id = {
        $nin: params.excludeTaskIds.map((id) => new Types.ObjectId(id)),
      };
    }

    return Task.find(filter).sort({ "scheduledTime.start": 1 }).exec();
  },
};
