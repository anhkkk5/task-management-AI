import cron, { ScheduledTask } from "node-cron";
import { Types } from "mongoose";
import { Task } from "../task/task.model";
import { AISchedule } from "../ai-schedule/ai-schedule.model";
import { notificationService } from "./notification.service";
import { NotificationType } from "./notification.model";
import { notificationRepository } from "./notification.repository";
import { userRepository } from "../user/user.repository";

let isRunning = false;
let scheduledTask: ScheduledTask | null = null;

const DEFAULT_REMINDER_MINUTES = 5;

const getReminderMinutesForUser = (user: {
  settings?: Record<string, unknown>;
}): number => {
  const raw = (user.settings as any)?.notifications?.reminderMinutes;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_REMINDER_MINUTES;
  if (n < 0) return 0;
  if (n > 24 * 60) return 24 * 60;
  return Math.floor(n);
};

// Cron job chạy mỗi phút để check deadline và scheduled tasks
export const reminderCronService = {
  start: (): void => {
    if (isRunning) return;

    // Chạy mỗi phút
    scheduledTask = cron.schedule("* * * * *", async () => {
      await scanAndNotifyDeadlines();
      await scanAndNotifyScheduledTasks();
      await scanAndNotifyAIScheduleTasks();
      await scanAndNotifyMissedTasks();
    });

    isRunning = true;
    console.log("Reminder cron job started (runs every minute)");
  },

  stop: (): void => {
    if (scheduledTask) {
      scheduledTask.stop();
      scheduledTask = null;
    }
    isRunning = false;
    console.log("Reminder cron job stopped");
  },

  get isRunning(): boolean {
    return isRunning;
  },
};

// Scan tasks sắp đến deadline và tạo notification
async function scanAndNotifyDeadlines(): Promise<void> {
  try {
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000); // 1 giờ sau

    // Tìm tasks có deadline trong vòng 1 giờ tới và chưa completed/cancelled
    const tasks = await Task.find({
      deadline: { $gte: now, $lte: oneHourFromNow },
      status: { $nin: ["completed", "cancelled"] },
    }).lean();

    for (const task of tasks) {
      const userId = String(task.userId);
      const taskId = String(task._id);

      // Check đã gửi reminder cho task này chưa (trong 24h qua)
      const alreadyReminded = await hasRecentReminder(
        userId,
        taskId,
        NotificationType.DEADLINE_ALERT,
      );
      if (alreadyReminded) {
        console.log(
          `[ReminderCron] Skipping duplicate reminder for task: ${task.title}`,
        );
        continue;
      }

      // Lấy thông tin user để có email
      const user = await userRepository.findById(userId);
      if (!user) {
        console.log(`[ReminderCron] User not found: ${userId}`);
        continue;
      }

      const deadlineStr = task.deadline
        ? new Date(task.deadline).toLocaleString("vi-VN")
        : "sắp tới";

      // Tạo notification với email từ user
      await notificationService.create({
        userId,
        type: NotificationType.DEADLINE_ALERT,
        title: `Task sắp đến hạn: ${task.title}`,
        content: `Task "${task.title}" sẽ đến hạn vào ${deadlineStr}. Hãy hoàn thành sớm!`,
        data: {
          taskId,
          deadline: task.deadline,
          userEmail: user.email,
        },
        channels: {
          inApp: true,
          email: true,
        },
      });

      console.log(
        `[ReminderCron] Sent deadline alert for task: ${task.title} to user: ${userId} (${user.email})`,
      );
    }
  } catch (err) {
    console.error("[ReminderCron] Error scanning deadlines:", err);
  }
}

// Scan tasks có scheduledTime sắp tới và gửi notification nhắc nhở
async function scanAndNotifyScheduledTasks(): Promise<void> {
  try {
    const now = new Date();
    // Query rộng hơn để hỗ trợ reminderMinutes theo user. Sau đó lọc lại theo setting.
    const maxLookAheadMinutes = 24 * 60;
    const lookAhead = new Date(now.getTime() + maxLookAheadMinutes * 60 * 1000);

    // Nếu server vừa start muộn, cho phép bắt lại các task vừa mới bắt đầu.
    const catchUpMinutes = 15;
    const fromTime = new Date(now.getTime() - catchUpMinutes * 60 * 1000);

    // Tìm tasks có scheduledTime.start trong vòng 24h tới và chưa started/completed/cancelled
    const tasks = await Task.find({
      "scheduledTime.start": { $gte: fromTime, $lte: lookAhead },
      status: { $nin: ["in_progress", "completed", "cancelled"] },
    }).lean();

    const userCache = new Map<
      string,
      { email: string; reminderMinutes: number }
    >();

    for (const task of tasks) {
      const userId = String(task.userId);
      const taskId = String(task._id);

      if (!task.scheduledTime) continue;

      let userInfo = userCache.get(userId);
      if (!userInfo) {
        const user = await userRepository.findById(userId);
        if (!user) {
          console.log(`[ReminderCron] User not found: ${userId}`);
          continue;
        }
        userInfo = {
          email: user.email,
          reminderMinutes: getReminderMinutesForUser(user),
        };
        userCache.set(userId, userInfo);
      }

      const reminderMinutes = userInfo.reminderMinutes;
      if (reminderMinutes <= 0) {
        continue;
      }

      const remindBeforeMs = reminderMinutes * 60 * 1000;
      const startTime = new Date(task.scheduledTime.start);

      // Case 1: nhắc trước khi bắt đầu
      const shouldRemindBy = new Date(now.getTime() + remindBeforeMs);
      // Case 2: server start muộn, nhưng task vừa mới bắt đầu trong khoảng reminderMinutes
      const startedRecentlyEnough =
        startTime <= now &&
        now.getTime() - startTime.getTime() <= remindBeforeMs;

      if (startTime > shouldRemindBy && !startedRecentlyEnough) {
        continue;
      }

      // Check đã gửi reminder cho scheduled task này chưa (trong 24h qua)
      const alreadyReminded = await hasRecentReminder(
        userId,
        taskId,
        NotificationType.SCHEDULED_TASK_ALERT,
      );
      if (alreadyReminded) {
        console.log(
          `[ReminderCron] Skipping duplicate scheduled reminder for task: ${task.title}`,
        );
        continue;
      }

      const startTimeStr = task.scheduledTime.start
        ? new Date(task.scheduledTime.start).toLocaleString("vi-VN")
        : "sắp tới";

      const endTimeStr = task.scheduledTime.end
        ? new Date(task.scheduledTime.end).toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";

      // Tạo notification nhắc nhở task sắp bắt đầu
      await notificationService.create({
        userId,
        type: NotificationType.SCHEDULED_TASK_ALERT,
        title: `⏰ Task sắp bắt đầu: ${task.title}`,
        content: `Task "${task.title}" sẽ bắt đầu sau ${reminderMinutes} phút (lúc ${startTimeStr})${endTimeStr ? ` - kết thúc ${endTimeStr}` : ""}. ${task.scheduledTime.reason || "Chuẩn bị sẵn sàng!"}`,
        data: {
          taskId,
          scheduledTime: task.scheduledTime,
          userEmail: userInfo.email,
        },
        channels: {
          inApp: true,
          email: true,
        },
      });

      console.log(
        `[ReminderCron] Sent scheduled task alert for task: ${task.title} to user: ${userId} (${userInfo.email})`,
      );
    }
  } catch (err) {
    console.error("[ReminderCron] Error scanning scheduled tasks:", err);
  }
}

// Parse suggestedTime string (e.g., "10:00-11:30") to Date objects
type ParsedTimeRange = {
  start: Date;
  end: Date;
  isValid: boolean;
};

const parseSuggestedTime = (
  suggestedTime: string,
  dateStr: string,
): ParsedTimeRange => {
  try {
    const match = suggestedTime.match(
      /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
    );
    if (!match) {
      return { start: new Date(), end: new Date(), isValid: false };
    }
    const [, startHour, startMin, endHour, endMin] = match;

    // Parse dateStr (format: "2026-03-15" or similar)
    const datePart = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
    const [year, month, day] = datePart.split("-").map(Number);

    const start = new Date(
      year,
      month - 1,
      day,
      parseInt(startHour),
      parseInt(startMin),
    );
    const end = new Date(
      year,
      month - 1,
      day,
      parseInt(endHour),
      parseInt(endMin),
    );

    return { start, end, isValid: true };
  } catch (e) {
    return { start: new Date(), end: new Date(), isValid: false };
  }
};

// Scan AI Schedule tasks và gửi reminder
async function scanAndNotifyAIScheduleTasks(): Promise<void> {
  try {
    const now = new Date();
    const maxLookAheadMinutes = 24 * 60;
    const lookAhead = new Date(now.getTime() + maxLookAheadMinutes * 60 * 1000);
    const catchUpMinutes = 15;
    const fromTime = new Date(now.getTime() - catchUpMinutes * 60 * 1000);

    // Tìm tất cả AI Schedules đang active có tasks trong vòng 24h tới
    const schedules = await AISchedule.find({
      isActive: true,
      "schedule.date": { $exists: true },
    }).lean();

    const userCache = new Map<
      string,
      { email: string; reminderMinutes: number }
    >();

    for (const schedule of schedules) {
      const userId = String(schedule.userId);

      if (!schedule.schedule || !Array.isArray(schedule.schedule)) continue;

      // Lấy user info từ cache hoặc query
      let userInfo = userCache.get(userId);
      if (!userInfo) {
        const user = await userRepository.findById(userId);
        if (!user) {
          console.log(`[ReminderCron] User not found: ${userId}`);
          continue;
        }
        userInfo = {
          email: user.email,
          reminderMinutes: getReminderMinutesForUser(user),
        };
        userCache.set(userId, userInfo);
      }

      const reminderMinutes = userInfo.reminderMinutes;
      if (reminderMinutes <= 0) {
        continue;
      }

      const remindBeforeMs = reminderMinutes * 60 * 1000;

      for (const day of schedule.schedule) {
        if (!day.tasks || !Array.isArray(day.tasks)) continue;

        for (const session of day.tasks) {
          // Skip if already in_progress, completed, or skipped
          if (
            session.status === "in_progress" ||
            session.status === "completed" ||
            session.status === "skipped"
          ) {
            continue;
          }

          const parsedTime = parseSuggestedTime(
            session.suggestedTime,
            day.date,
          );
          if (!parsedTime.isValid) continue;

          const startTime = parsedTime.start;

          // Check if task is within notification window
          const shouldRemindBy = new Date(now.getTime() + remindBeforeMs);
          const startedRecentlyEnough =
            startTime <= now &&
            now.getTime() - startTime.getTime() <= remindBeforeMs;

          // Task nằm ngoài window cần remind
          if (startTime > lookAhead) continue;
          if (startTime < fromTime && !startedRecentlyEnough) continue;
          if (startTime > shouldRemindBy && !startedRecentlyEnough) {
            continue;
          }

          // Check đã gửi reminder cho session này chưa (dùng sessionId như taskId)
          const sessionTaskId = session.sessionId || session.taskId;
          const alreadyReminded = await hasRecentReminder(
            userId,
            sessionTaskId,
            NotificationType.SCHEDULED_TASK_ALERT,
          );
          if (alreadyReminded) {
            console.log(
              `[ReminderCron] Skipping duplicate AI Schedule reminder for: ${session.title}`,
            );
            continue;
          }

          const startTimeStr = startTime.toLocaleString("vi-VN");
          const endTimeStr = parsedTime.end.toLocaleTimeString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
          });

          // Tạo notification nhắc nhở task sắp bắt đầu
          await notificationService.create({
            userId,
            type: NotificationType.SCHEDULED_TASK_ALERT,
            title: `⏰ Task AI sắp bắt đầu: ${session.title}`,
            content: `Task "${session.title}" sẽ bắt đầu sau ${reminderMinutes} phút (lúc ${startTimeStr}) - kết thúc ${endTimeStr}. ${session.reason || "Chuẩn bị sẵn sàng!"}`,
            data: {
              taskId: sessionTaskId,
              scheduleId: String(schedule._id),
              sessionId: session.sessionId,
              scheduledTime: {
                start: startTime,
                end: parsedTime.end,
                reason: session.reason,
              },
              userEmail: userInfo.email,
              source: "ai_schedule",
            },
            channels: {
              inApp: true,
              email: true,
            },
          });

          console.log(
            `[ReminderCron] Sent AI Schedule alert for task: ${session.title} to user: ${userId} (${userInfo.email})`,
          );
        }
      }
    }
  } catch (err) {
    console.error("[ReminderCron] Error scanning AI Schedule tasks:", err);
  }
}

// Scan tasks bị bỏ lỡ (scheduledTime đã qua nhưng chưa started/completed) và gửi notification với gợi ý reschedule
async function scanAndNotifyMissedTasks(): Promise<void> {
  try {
    const now = new Date();
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000); // 30 phút trước

    // Tìm tasks có scheduledTime.start đã qua 30 phút nhưng chưa in_progress/completed/cancelled
    const tasks = await Task.find({
      "scheduledTime.start": {
        $lte: thirtyMinutesAgo,
        $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      }, // Trong vòng 24h qua
      status: { $nin: ["in_progress", "completed", "cancelled"] },
    }).lean();

    for (const task of tasks) {
      const userId = String(task.userId);
      const taskId = String(task._id);

      if (!task.scheduledTime) continue;

      // Check đã gửi missed notification cho task này chưa (trong 24h qua)
      const alreadyNotified = await hasRecentReminder(
        userId,
        taskId,
        NotificationType.SYSTEM,
      );
      if (alreadyNotified) {
        console.log(
          `[ReminderCron] Skipping duplicate missed task notification for: ${task.title}`,
        );
        continue;
      }

      // Lấy thông tin user để có email
      const user = await userRepository.findById(userId);
      if (!user) {
        console.log(`[ReminderCron] User not found: ${userId}`);
        continue;
      }

      const scheduledStartStr = task.scheduledTime.start
        ? new Date(task.scheduledTime.start).toLocaleString("vi-VN")
        : "";

      // Tạo notification thông báo task bị bỏ lỡ và gợi ý reschedule
      await notificationService.create({
        userId,
        type: NotificationType.SYSTEM,
        title: `⚠️ Task bị bỏ lỡ: ${task.title}`,
        content: `Task "${task.title}" đã được lên lịch bắt đầu lúc ${scheduledStartStr} nhưng chưa được thực hiện. Bạn có muốn AI đề xuất lịch mới?`,
        data: {
          taskId,
          scheduledTime: task.scheduledTime,
          userEmail: user.email,
          action: "smart_reschedule", // Để FE biết hiển thị nút reschedule
          reason: "missed",
        },
        channels: {
          inApp: true,
          email: true,
        },
      });

      console.log(
        `[ReminderCron] Sent missed task alert for task: ${task.title} to user: ${userId}`,
      );
    }
  } catch (err) {
    console.error("[ReminderCron] Error scanning missed tasks:", err);
  }
}

// Kiểm tra đã có reminder gần đây cho task chưa (trong 24h qua)
async function hasRecentReminder(
  userId: string,
  taskId: string,
  type: NotificationType = NotificationType.DEADLINE_ALERT,
): Promise<boolean> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const existingNotification =
    await notificationRepository.findRecentByTaskAndType(
      taskId,
      userId,
      type,
      twentyFourHoursAgo,
    );

  return !!existingNotification;
}

// Manual trigger (cho testing)
export const triggerDeadlineScan = async (): Promise<void> => {
  console.log("[ReminderCron] Manual trigger started");
  await scanAndNotifyDeadlines();
  await scanAndNotifyScheduledTasks();
  await scanAndNotifyAIScheduleTasks();
  await scanAndNotifyMissedTasks();
  console.log("[ReminderCron] Manual trigger completed");
};
