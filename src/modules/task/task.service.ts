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
import { notificationRepository } from "../notification/notification.repository";
import { NotificationType } from "../notification/notification.model";
import { notificationQueueService } from "../notification/notification.queue";
import { userRepository } from "../user/user.repository";
import { aiScheduleRepository } from "../ai-schedule/ai-schedule.repository";

export type PublicTask = {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  startAt?: Date;
  deadline?: Date;
  tags: string[];
  type?: "event" | "todo" | "appointment";
  allDay?: boolean;
  guests: string[];
  guestDetails?: Array<{
    guestId: string;
    email: string;
    name: string;
    avatar?: string;
    permission: "edit_event" | "view_guest_list" | "invite_others";
    status?: "pending" | "accepted" | "declined";
  }>;
  location?: string;
  visibility: "default" | "public" | "private";
  reminderMinutes?: number;
  recurrence?: string;
  meetingLink?: string;
  userId: string;
  parentTaskId?: string;
  aiBreakdown: {
    title: string;
    status: string;
    estimatedDuration?: number;
    difficulty?: "easy" | "medium" | "hard";
    description?: string;
    scheduledDate?: string;
    scheduledTime?: string;
  }[];
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
    startAt: t.startAt ?? t.teamAssignment?.startAt,
    deadline: t.deadline,
    tags: t.tags ?? [],
    type: t.type,
    allDay: t.allDay,
    guests: t.guests ?? [],
    guestDetails: t.guestDetails
      ? (t.guestDetails as any[]).map((g: any) => ({
          guestId: String(g.guestId),
          email: g.email,
          name: g.name,
          avatar: g.avatar,
          permission: g.permission,
          status: g.status,
        }))
      : undefined,
    location: t.location,
    visibility: t.visibility ?? "default",
    reminderMinutes: t.reminderMinutes,
    recurrence: t.recurrence,
    meetingLink: t.meetingLink,
    userId: String(t.userId),
    parentTaskId: t.parentTaskId ? String(t.parentTaskId) : undefined,
    aiBreakdown: (t.aiBreakdown ?? []).map((x: any) => ({
      title: x.title,
      status: x.status,
      estimatedDuration: x.estimatedDuration,
      difficulty: x.difficulty,
      description: x.description,
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
const generateInviteEmailHtml = (params: {
  taskTitle: string;
  organizerName: string;
  organizerEmail: string;
  startTime?: Date;
  endTime?: Date;
  location?: string;
  meetingLink?: string;
  description?: string;
}): string => {
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
const sendGuestInvites = async (params: {
  userId: string;
  task: PublicTask;
  previousGuests?: string[];
}): Promise<void> => {
  const { userId, task, previousGuests = [] } = params;

  if (!task.guests || task.guests.length === 0) return;

  // Chỉ gửi cho guests mới (không có trong previousGuests)
  const newGuests = task.guests.filter((g) => !previousGuests.includes(g));
  if (newGuests.length === 0) return;

  // Lấy thông tin organizer
  const organizer = await userRepository.findById(userId);
  if (!organizer) return;

  const organizerName = organizer.name || organizer.email;
  const organizerEmail = organizer.email;

  for (const guestEmail of newGuests) {
    // Không gửi cho chính organizer
    if (guestEmail === organizerEmail.toLowerCase()) continue;

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

    await notificationQueueService.addInviteEmail({
      to: guestEmail,
      subject: `Lời mời tham gia: ${task.title}`,
      html,
      taskTitle: task.title,
      organizerEmail,
    });
  }
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
      | "startAt"
      | "reminderAt"
      | "createdAt"
      | "updatedAt"
      | "dailyTargetDuration"
      | "dailyTargetMin"
    > & {
      startAt?: string;
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
      startAt: t.startAt ? new Date(t.startAt) : undefined,
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

    // Convert guestDetails guestId strings to ObjectId
    const guestDetails = dto.guestDetails
      ? dto.guestDetails.map((g) => ({
          guestId: new Types.ObjectId(g.guestId),
          email: g.email,
          name: g.name,
          avatar: g.avatar,
          permission: g.permission,
          status: g.status,
        }))
      : undefined;

    const doc = await taskRepository.create({
      title,
      description: dto.description,
      type: dto.type,
      allDay: dto.allDay,
      guests: dto.guests,
      guestDetails,
      location: dto.location,
      visibility: dto.visibility,
      reminderMinutes: dto.reminderMinutes,
      recurrence: dto.recurrence,
      meetingLink: dto.meetingLink,
      startAt: dto.startAt,
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

    const publicTask = toPublicTask(doc);

    // Send invite emails to guests (don't wait)
    if (dto.guests && dto.guests.length > 0) {
      sendGuestInvites({ userId, task: publicTask }).catch((err) => {
        console.error(
          "[TaskService] Failed to send guest invites:",
          err.message,
        );
      });
    }

    return publicTask;
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

    // Convert guestDetails guestId strings to ObjectId
    const guestDetails = dto.guestDetails
      ? dto.guestDetails.map((g) => ({
          guestId: new Types.ObjectId(g.guestId),
          email: g.email,
          name: g.name,
          avatar: g.avatar,
          permission: g.permission,
          status: g.status,
        }))
      : undefined;

    const updated = await taskRepository.updateByIdForUser(
      {
        taskId,
        userId: new Types.ObjectId(userId),
      },
      {
        title,
        description: dto.description,
        type: dto.type,
        allDay: dto.allDay,
        guests: dto.guests,
        guestDetails,
        location: dto.location,
        visibility: dto.visibility,
        reminderMinutes: dto.reminderMinutes,
        recurrence: dto.recurrence,
        meetingLink: dto.meetingLink,
        status: dto.status,
        priority: dto.priority,
        startAt: dto.startAt,
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

    // If scheduledTime was updated, delete old scheduled notifications for this task
    // so that new reminders can be sent for the new time
    if (dto.scheduledTime && updated) {
      try {
        const deletedCount = await notificationRepository.deleteByTaskId(
          new Types.ObjectId(userId),
          taskId,
          [
            NotificationType.SCHEDULED_TASK_ALERT,
            NotificationType.DEADLINE_ALERT,
          ],
        );
        if (deletedCount > 0) {
          console.log(
            `[TaskUpdate] Deleted ${deletedCount} old scheduled notifications for task ${taskId} due to scheduledTime change`,
          );
        }
      } catch (err: any) {
        console.error(
          `[TaskUpdate] Failed to delete old notifications: ${err.message}`,
        );
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

    const publicTask = toPublicTask(updated);

    // Send invite emails to new guests (don't wait)
    if (dto.guests && dto.guests.length > 0) {
      const previousGuests = (currentTask.guests || []).map((g: string) =>
        g.toLowerCase(),
      );
      sendGuestInvites({ userId, task: publicTask, previousGuests }).catch(
        (err) => {
          console.error(
            "[TaskService] Failed to send guest invites:",
            err.message,
          );
        },
      );
    }

    return publicTask;
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

    // Cascade delete: Xóa tất cả task con có parentTaskId trỏ đến task vừa xóa
    const deletedChildrenCount = await taskRepository.deleteManyByParentTaskId({
      parentTaskId: taskId,
      userId: new Types.ObjectId(userId),
    });

    if (deletedChildrenCount > 0) {
      console.log(
        `[TaskDelete] Đã xóa ${deletedChildrenCount} task con của task ${taskId}`,
      );
    }

    // Xóa sessions của taskId này khỏi tất cả AISchedule
    const { AISchedule } = await import("../ai-schedule/ai-schedule.model");
    const schedules = await AISchedule.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    }).exec();

    for (const schedule of schedules) {
      let modified = false;
      for (const day of schedule.schedule) {
        const before = day.tasks.length;
        day.tasks = day.tasks.filter((s) => String(s.taskId) !== taskId);
        if (day.tasks.length !== before) modified = true;
      }
      if (modified) {
        schedule.sourceTasks = schedule.sourceTasks.filter(
          (id) => id !== taskId,
        );
        schedule.markModified("schedule");
        schedule.markModified("sourceTasks");
        await schedule.save();
        console.log(
          `[TaskDelete] Đã xóa sessions của task ${taskId} khỏi schedule ${schedule._id}`,
        );
      }
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

    // Đọc sessions từ AISchedule
    const { AISchedule } = await import("../ai-schedule/ai-schedule.model");
    const activeSchedules = await AISchedule.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
      sourceTasks: taskId,
    }).lean();

    // Thu thập slots theo thứ tự ngày/giờ
    type Slot = {
      date: string;
      day: string;
      time: string;
      durationMinutes: number;
    };
    const slots: Slot[] = [];
    for (const schedule of activeSchedules) {
      for (const day of schedule.schedule) {
        for (const session of day.tasks) {
          if (String(session.taskId) === taskId) {
            let durationMinutes = 60;
            const m = session.suggestedTime.match(
              /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
            );
            if (m) {
              durationMinutes =
                parseInt(m[3]) * 60 +
                parseInt(m[4]) -
                (parseInt(m[1]) * 60 + parseInt(m[2]));
            }
            slots.push({
              date: day.date,
              day: day.day,
              time: session.suggestedTime,
              durationMinutes,
            });
          }
        }
      }
    }
    slots.sort((a, b) => a.date.localeCompare(b.date));

    // Tổng thời gian từ slots (nếu có lịch) hoặc từ estimatedDuration
    const totalSlotMinutes = slots.reduce(
      (sum, s) => sum + s.durationMinutes,
      0,
    );
    const targetTotalMinutes =
      task.estimatedDuration || totalSlotMinutes || undefined;

    const breakdown = await aiService.taskBreakdown(userId, {
      title: task.title,
      deadline: task.deadline,
      description: task.description,
      totalMinutes: targetTotalMinutes,
      slots: slots.length > 0 ? slots : undefined,
    });

    // Thuật toán phân bổ: gán subtask vào slot theo tỷ lệ thời gian
    const stepsWithSlot = breakdown.steps.map((s, i) => {
      let assignedSlot: Slot | undefined;

      if (slots.length === 0) {
        assignedSlot = undefined;
      } else if (slots.length === breakdown.steps.length) {
        // Chẵn → 1-1
        assignedSlot = slots[i];
      } else {
        // Không chẵn → phân bổ theo tỷ lệ tích lũy
        const totalSubtaskMinutes = breakdown.steps.reduce(
          (sum: number, step: { estimatedDuration?: number }) =>
            sum + (step.estimatedDuration ?? 60),
          0,
        );
        const subtaskStartMinutes = breakdown.steps
          .slice(0, i)
          .reduce(
            (sum: number, step: { estimatedDuration?: number }) =>
              sum + (step.estimatedDuration ?? 60),
            0,
          );
        const subtaskMidMinutes =
          subtaskStartMinutes + (s.estimatedDuration ?? 60) / 2;
        const targetSlotMinute =
          (subtaskMidMinutes / totalSubtaskMinutes) * totalSlotMinutes;

        let accumulated = 0;
        assignedSlot = slots[slots.length - 1];
        for (const slot of slots) {
          accumulated += slot.durationMinutes;
          if (accumulated >= targetSlotMinute) {
            assignedSlot = slot;
            break;
          }
        }
      }

      return {
        title: s.title,
        status: s.status as any,
        estimatedDuration: s.estimatedDuration,
        difficulty: s.difficulty,
        description: s.description,
        scheduledDate: assignedSlot?.date,
        scheduledTime: assignedSlot?.time,
      };
    });

    const updated = await taskRepository.updateByIdForUser(
      { taskId, userId: new Types.ObjectId(userId) },
      {
        aiBreakdown: stepsWithSlot,
        // KHÔNG ghi đè estimatedDuration
      },
    );

    if (!updated) {
      throw new Error("TASK_FORBIDDEN");
    }

    // Cập nhật title sessions trong AISchedule
    const subtaskTitles = stepsWithSlot.map((s) => s.title);
    await aiScheduleRepository.updateSessionTitlesForTask(
      userId,
      taskId,
      subtaskTitles,
    );

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

    // Group sessions by taskId to efficiently fetch parent tasks
    const sessionsByTaskId = new Map<string, typeof schedule>();
    for (const item of schedule) {
      if (!Types.ObjectId.isValid(item.taskId)) continue;
      const list = sessionsByTaskId.get(item.taskId) || [];
      list.push(item);
      sessionsByTaskId.set(item.taskId, list);
    }

    let createdCount = 0;
    let updatedCount = 0;

    for (const [taskId, sessions] of sessionsByTaskId.entries()) {
      // Get parent task info
      const parentTask = await taskRepository.findByIdForUser({
        taskId,
        userId: new Types.ObjectId(userId),
      });

      if (!parentTask) {
        console.log(`[SaveAISchedule] Parent task not found: ${taskId}`);
        continue;
      }

      // Mark parent task as having AI schedule (but don't set scheduledTime)
      // The actual sessions are represented by subtasks
      if (parentTask.status === "todo") {
        await taskRepository.updateByIdForUser(
          { taskId, userId: new Types.ObjectId(userId) },
          { status: "scheduled" },
        );
        updatedCount++;
      }

      // Create a subtask for each session
      for (let i = 0; i < sessions.length; i++) {
        const session = sessions[i];
        const startTime = session.scheduledTime.start;
        const endTime = session.scheduledTime.end;
        const timeStr = `${startTime.getHours().toString().padStart(2, "0")}:${startTime.getMinutes().toString().padStart(2, "0")}-${endTime.getHours().toString().padStart(2, "0")}:${endTime.getMinutes().toString().padStart(2, "0")}`;

        const subtaskTitle =
          sessions.length === 1
            ? parentTask.title
            : `${parentTask.title} (Phiên ${i + 1}/${sessions.length})`;

        try {
          await taskRepository.create({
            title: subtaskTitle,
            description:
              session.scheduledTime.reason ||
              `Phiên làm việc ${i + 1} theo lịch AI`,
            status: "scheduled",
            priority: parentTask.priority,
            deadline: parentTask.deadline,
            tags: [...(parentTask.tags || [])],
            userId: new Types.ObjectId(userId),
            parentTaskId: new Types.ObjectId(taskId),
            estimatedDuration: Math.round(
              (endTime.getTime() - startTime.getTime()) / (1000 * 60),
            ),
            scheduledTime: {
              start: startTime,
              end: endTime,
              aiPlanned: true,
              reason:
                session.scheduledTime.reason || `Phiên ${i + 1} theo lịch AI`,
            },
          });
          createdCount++;
          console.log(
            `[SaveAISchedule] Created subtask "${subtaskTitle}" for ${timeStr}`,
          );
        } catch (err: any) {
          console.error(
            `[SaveAISchedule] Failed to create subtask for session ${session.sessionId}: ${err.message}`,
          );
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
