import cron, { ScheduledTask } from "node-cron";
import { Types } from "mongoose";
import { Task } from "../task/task.model";
import { notificationService } from "./notification.service";
import { NotificationType } from "./notification.model";

let isRunning = false;
let scheduledTask: ScheduledTask | null = null;

// Cron job chạy mỗi phút để check deadline
export const reminderCronService = {
  start: (): void => {
    if (isRunning) return;

    // Chạy mỗi phút
    scheduledTask = cron.schedule("* * * * *", async () => {
      await scanAndNotifyDeadlines();
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
      const alreadyReminded = await hasRecentReminder(taskId, userId);
      if (alreadyReminded) continue;

      const deadlineStr = task.deadline
        ? new Date(task.deadline).toLocaleString("vi-VN")
        : "sắp tới";

      // Tạo notification
      await notificationService.create({
        userId,
        type: NotificationType.DEADLINE_ALERT,
        title: `Task sắp đến hạn: ${task.title}`,
        content: `Task "${task.title}" sẽ đến hạn vào ${deadlineStr}. Hãy hoàn thành sớm!`,
        data: {
          taskId,
          deadline: task.deadline,
        },
        channels: {
          inApp: true,
          email: true, // sẽ gửi email trong Commit 6
        },
      });

      console.log(
        `[ReminderCron] Sent deadline alert for task: ${task.title} to user: ${userId}`,
      );
    }
  } catch (err) {
    console.error("[ReminderCron] Error scanning deadlines:", err);
  }
}

// Kiểm tra đã có reminder gần đây cho task chưa
async function hasRecentReminder(
  taskId: string,
  userId: string,
): Promise<boolean> {
  // TODO: Query DB để check xem đã có notification DEADLINE_ALERT
  // cho task này trong 24h qua chưa
  // Giờ tạm return false để luôn gửi (cho testing)
  return false;
}

// Manual trigger (cho testing)
export const triggerDeadlineScan = async (): Promise<void> => {
  console.log("[ReminderCron] Manual trigger started");
  await scanAndNotifyDeadlines();
  console.log("[ReminderCron] Manual trigger completed");
};
