import cron, { ScheduledTask } from "node-cron";
import { Types } from "mongoose";
import { Task } from "../task/task.model";
import { notificationService } from "./notification.service";
import { NotificationType } from "./notification.model";
import { notificationRepository } from "./notification.repository";
import { userRepository } from "../user/user.repository";

let isRunning = false;
let scheduledTask: ScheduledTask | null = null;

// Cron job chạy mỗi phút để check deadline và scheduled tasks
export const reminderCronService = {
  start: (): void => {
    if (isRunning) return;

    // Chạy mỗi phút
    scheduledTask = cron.schedule("* * * * *", async () => {
      await scanAndNotifyDeadlines();
      await scanAndNotifyScheduledTasks();
      await scanAndNotifyMissedTasks(); // Thêm hàm mới
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
        taskId,
        userId,
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
    const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000); // 15 phút sau

    // Tìm tasks có scheduledTime.start trong vòng 15 phút tới và chưa started/completed/cancelled
    const tasks = await Task.find({
      "scheduledTime.start": { $gte: now, $lte: fifteenMinutesFromNow },
      "scheduledTime.aiPlanned": true,
      status: { $nin: ["in_progress", "completed", "cancelled"] },
    }).lean();

    for (const task of tasks) {
      const userId = String(task.userId);
      const taskId = String(task._id);

      if (!task.scheduledTime) continue;

      // Check đã gửi reminder cho scheduled task này chưa (trong 24h qua)
      const alreadyReminded = await hasRecentReminder(
        taskId,
        userId,
        NotificationType.SCHEDULED_TASK_ALERT,
      );
      if (alreadyReminded) {
        console.log(
          `[ReminderCron] Skipping duplicate scheduled reminder for task: ${task.title}`,
        );
        continue;
      }

      // Lấy thông tin user để có email
      const user = await userRepository.findById(userId);
      if (!user) {
        console.log(`[ReminderCron] User not found: ${userId}`);
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
        content: `Task "${task.title}" sẽ bắt đầu lúc ${startTimeStr}${endTimeStr ? ` - kết thúc ${endTimeStr}` : ""}. ${task.scheduledTime.reason || "Chuẩn bị sẵn sàng!"}`,
        data: {
          taskId,
          scheduledTime: task.scheduledTime,
          userEmail: user.email,
        },
        channels: {
          inApp: true,
          email: true,
        },
      });

      console.log(
        `[ReminderCron] Sent scheduled task alert for task: ${task.title} to user: ${userId} (${user.email})`,
      );
    }
  } catch (err) {
    console.error("[ReminderCron] Error scanning scheduled tasks:", err);
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
      "scheduledTime.aiPlanned": true,
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
  await scanAndNotifyMissedTasks();
  console.log("[ReminderCron] Manual trigger completed");
};
