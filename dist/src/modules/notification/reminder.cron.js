"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerDeadlineScan = exports.reminderCronService = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const task_model_1 = require("../task/task.model");
const ai_schedule_model_1 = require("../ai-schedule/ai-schedule.model");
const notification_service_1 = require("./notification.service");
const notification_model_1 = require("./notification.model");
const notification_repository_1 = require("./notification.repository");
const user_repository_1 = require("../user/user.repository");
let isRunning = false;
let scheduledTask = null;
const DEFAULT_REMINDER_MINUTES = 5;
const getReminderMinutesForUser = (user) => {
    const raw = user.settings?.notifications?.reminderMinutes;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n))
        return DEFAULT_REMINDER_MINUTES;
    if (n < 0)
        return 0;
    if (n > 24 * 60)
        return 24 * 60;
    return Math.floor(n);
};
// Cron job chạy mỗi phút để check deadline và scheduled tasks
exports.reminderCronService = {
    start: () => {
        if (isRunning)
            return;
        // Chạy mỗi phút
        scheduledTask = node_cron_1.default.schedule("* * * * *", async () => {
            await scanAndNotifyDeadlines();
            await scanAndNotifyScheduledTasks();
            await scanAndNotifyAIScheduleTasks();
            await scanAndNotifyMissedTasks();
            await resurrectSnoozedTick();
            await digestTick();
        });
        isRunning = true;
        console.log("Reminder cron job started (runs every minute)");
    },
    stop: () => {
        if (scheduledTask) {
            scheduledTask.stop();
            scheduledTask = null;
        }
        isRunning = false;
        console.log("Reminder cron job stopped");
    },
    get isRunning() {
        return isRunning;
    },
};
// Scan tasks sắp đến deadline và tạo notification
async function scanAndNotifyDeadlines() {
    try {
        const now = new Date();
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000); // 1 giờ sau
        // Tìm tasks có deadline trong vòng 1 giờ tới và chưa completed/cancelled
        const tasks = await task_model_1.Task.find({
            deadline: { $gte: now, $lte: oneHourFromNow },
            status: { $nin: ["completed", "cancelled"] },
        }).lean();
        for (const task of tasks) {
            const userId = String(task.userId);
            const taskId = String(task._id);
            // Check đã gửi reminder cho task này chưa (trong 24h qua)
            const alreadyReminded = await hasRecentReminder(userId, taskId, notification_model_1.NotificationType.DEADLINE_ALERT);
            if (alreadyReminded) {
                console.log(`[ReminderCron] Skipping duplicate reminder for task: ${task.title}`);
                continue;
            }
            // Lấy thông tin user để có email
            const user = await user_repository_1.userRepository.findById(userId);
            if (!user) {
                console.log(`[ReminderCron] User not found: ${userId}`);
                continue;
            }
            const deadlineStr = task.deadline
                ? new Date(task.deadline).toLocaleString("vi-VN")
                : "sắp tới";
            // Tạo notification với email từ user
            await notification_service_1.notificationService.create({
                userId,
                type: notification_model_1.NotificationType.DEADLINE_ALERT,
                title: `Task sắp đến hạn: ${task.title}`,
                content: `Task "${task.title}" sẽ đến hạn vào ${deadlineStr}. Hãy hoàn thành sớm!`,
                data: {
                    taskId,
                    deadline: task.deadline,
                    taskPriority: task.priority,
                    userEmail: user.email,
                },
                channels: {
                    inApp: true,
                    email: true,
                },
            });
            console.log(`[ReminderCron] Sent deadline alert for task: ${task.title} to user: ${userId} (${user.email})`);
        }
    }
    catch (err) {
        console.error("[ReminderCron] Error scanning deadlines:", err);
    }
}
async function digestTick() {
    try {
        const n = await notification_service_1.notificationService.sendDigestForDueUsers();
        if (n > 0) {
            console.log(`[ReminderCron] Sent ${n} digest email batch(es)`);
        }
    }
    catch (err) {
        console.error("[ReminderCron] Error sending digest:", err);
    }
}
// Scan tasks có scheduledTime sắp tới và gửi notification nhắc nhở
async function scanAndNotifyScheduledTasks() {
    try {
        const now = new Date();
        // Query rộng hơn để hỗ trợ reminderMinutes theo user. Sau đó lọc lại theo setting.
        const maxLookAheadMinutes = 24 * 60;
        const lookAhead = new Date(now.getTime() + maxLookAheadMinutes * 60 * 1000);
        // Nếu server vừa start muộn, cho phép bắt lại các task vừa mới bắt đầu.
        const catchUpMinutes = 15;
        const fromTime = new Date(now.getTime() - catchUpMinutes * 60 * 1000);
        // Tìm tasks có scheduledTime.start trong vòng 24h tới và chưa started/completed/cancelled
        const tasks = await task_model_1.Task.find({
            "scheduledTime.start": { $gte: fromTime, $lte: lookAhead },
            status: { $nin: ["in_progress", "completed", "cancelled"] },
        }).lean();
        const userCache = new Map();
        for (const task of tasks) {
            const userId = String(task.userId);
            const taskId = String(task._id);
            if (!task.scheduledTime)
                continue;
            let userInfo = userCache.get(userId);
            if (!userInfo) {
                const user = await user_repository_1.userRepository.findById(userId);
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
            // Ưu tiên reminderMinutes của task nếu có, nếu không thì dùng setting của user
            const reminderMinutes = typeof task.reminderMinutes === "number"
                ? task.reminderMinutes
                : userInfo.reminderMinutes;
            if (reminderMinutes <= 0) {
                continue;
            }
            const remindBeforeMs = reminderMinutes * 60 * 1000;
            const startTime = new Date(task.scheduledTime.start);
            // Case 1: nhắc trước khi bắt đầu
            const shouldRemindBy = new Date(now.getTime() + remindBeforeMs);
            // Case 2: server start muộn, nhưng task vừa mới bắt đầu trong khoảng reminderMinutes
            const startedRecentlyEnough = startTime <= now &&
                now.getTime() - startTime.getTime() <= remindBeforeMs;
            if (startTime > shouldRemindBy && !startedRecentlyEnough) {
                continue;
            }
            // Check đã gửi reminder cho scheduled task này chưa (trong 24h qua)
            const alreadyReminded = await hasRecentReminder(userId, taskId, notification_model_1.NotificationType.SCHEDULED_TASK_ALERT);
            if (alreadyReminded) {
                console.log(`[ReminderCron] Skipping duplicate scheduled reminder for task: ${task.title}`);
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
            await notification_service_1.notificationService.create({
                userId,
                type: notification_model_1.NotificationType.SCHEDULED_TASK_ALERT,
                title: `⏰ Task sắp bắt đầu: ${task.title}`,
                content: `Task "${task.title}" sẽ bắt đầu sau ${reminderMinutes} phút (lúc ${startTimeStr})${endTimeStr ? ` - kết thúc ${endTimeStr}` : ""}. ${task.scheduledTime.reason || "Chuẩn bị sẵn sàng!"}`,
                data: {
                    taskId,
                    scheduledTime: task.scheduledTime,
                    taskPriority: task.priority,
                    userEmail: userInfo.email,
                },
                channels: {
                    inApp: true,
                    email: true,
                },
            });
            console.log(`[ReminderCron] Sent scheduled task alert for task: ${task.title} to user: ${userId} (${userInfo.email})`);
        }
    }
    catch (err) {
        console.error("[ReminderCron] Error scanning scheduled tasks:", err);
    }
}
const parseSuggestedTime = (suggestedTime, dateStr) => {
    try {
        const match = suggestedTime.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
        if (!match) {
            return { start: new Date(), end: new Date(), isValid: false };
        }
        const [, startHour, startMin, endHour, endMin] = match;
        // Parse dateStr (format: "2026-03-15" or similar)
        const datePart = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
        const [year, month, day] = datePart.split("-").map(Number);
        const start = new Date(year, month - 1, day, parseInt(startHour), parseInt(startMin));
        const end = new Date(year, month - 1, day, parseInt(endHour), parseInt(endMin));
        return { start, end, isValid: true };
    }
    catch (e) {
        return { start: new Date(), end: new Date(), isValid: false };
    }
};
// Scan AI Schedule tasks và gửi reminder
async function scanAndNotifyAIScheduleTasks() {
    try {
        const now = new Date();
        const maxLookAheadMinutes = 24 * 60;
        const lookAhead = new Date(now.getTime() + maxLookAheadMinutes * 60 * 1000);
        const catchUpMinutes = 15;
        const fromTime = new Date(now.getTime() - catchUpMinutes * 60 * 1000);
        // Tìm tất cả AI Schedules đang active có tasks trong vòng 24h tới
        const schedules = await ai_schedule_model_1.AISchedule.find({
            isActive: true,
            "schedule.date": { $exists: true },
        }).lean();
        const userCache = new Map();
        for (const schedule of schedules) {
            const userId = String(schedule.userId);
            if (!schedule.schedule || !Array.isArray(schedule.schedule))
                continue;
            // Lấy user info từ cache hoặc query
            let userInfo = userCache.get(userId);
            if (!userInfo) {
                const user = await user_repository_1.userRepository.findById(userId);
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
                if (!day.tasks || !Array.isArray(day.tasks))
                    continue;
                for (const session of day.tasks) {
                    // Skip if already in_progress, completed, or skipped
                    if (session.status === "in_progress" ||
                        session.status === "completed" ||
                        session.status === "skipped") {
                        continue;
                    }
                    const parsedTime = parseSuggestedTime(session.suggestedTime, day.date);
                    if (!parsedTime.isValid)
                        continue;
                    const startTime = parsedTime.start;
                    // Check if task is within notification window
                    const shouldRemindBy = new Date(now.getTime() + remindBeforeMs);
                    const startedRecentlyEnough = startTime <= now &&
                        now.getTime() - startTime.getTime() <= remindBeforeMs;
                    // Task nằm ngoài window cần remind
                    if (startTime > lookAhead)
                        continue;
                    if (startTime < fromTime && !startedRecentlyEnough)
                        continue;
                    if (startTime > shouldRemindBy && !startedRecentlyEnough) {
                        continue;
                    }
                    // Check đã gửi reminder cho session này chưa (dùng sessionId như taskId)
                    const sessionTaskId = session.sessionId || session.taskId;
                    const alreadyReminded = await hasRecentReminder(userId, sessionTaskId, notification_model_1.NotificationType.SCHEDULED_TASK_ALERT);
                    if (alreadyReminded) {
                        console.log(`[ReminderCron] Skipping duplicate AI Schedule reminder for: ${session.title}`);
                        continue;
                    }
                    const startTimeStr = startTime.toLocaleString("vi-VN");
                    const endTimeStr = parsedTime.end.toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                    });
                    // Tạo notification nhắc nhở task sắp bắt đầu
                    await notification_service_1.notificationService.create({
                        userId,
                        type: notification_model_1.NotificationType.SCHEDULED_TASK_ALERT,
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
                    console.log(`[ReminderCron] Sent AI Schedule alert for task: ${session.title} to user: ${userId} (${userInfo.email})`);
                }
            }
        }
    }
    catch (err) {
        console.error("[ReminderCron] Error scanning AI Schedule tasks:", err);
    }
}
// Scan tasks bị bỏ lỡ (scheduledTime đã qua nhưng chưa started/completed) và gửi notification với gợi ý reschedule
async function scanAndNotifyMissedTasks() {
    try {
        const now = new Date();
        const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000); // 30 phút trước
        // Tìm tasks có scheduledTime.start đã qua 30 phút nhưng chưa in_progress/completed/cancelled
        const tasks = await task_model_1.Task.find({
            "scheduledTime.start": {
                $lte: thirtyMinutesAgo,
                $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            }, // Trong vòng 24h qua
            status: { $nin: ["in_progress", "completed", "cancelled"] },
        }).lean();
        for (const task of tasks) {
            const userId = String(task.userId);
            const taskId = String(task._id);
            if (!task.scheduledTime)
                continue;
            // Check đã gửi missed notification cho task này chưa (trong 24h qua)
            const alreadyNotified = await hasRecentReminder(userId, taskId, notification_model_1.NotificationType.SYSTEM);
            if (alreadyNotified) {
                console.log(`[ReminderCron] Skipping duplicate missed task notification for: ${task.title}`);
                continue;
            }
            // Lấy thông tin user để có email
            const user = await user_repository_1.userRepository.findById(userId);
            if (!user) {
                console.log(`[ReminderCron] User not found: ${userId}`);
                continue;
            }
            const scheduledStartStr = task.scheduledTime.start
                ? new Date(task.scheduledTime.start).toLocaleString("vi-VN")
                : "";
            // Tạo notification thông báo task bị bỏ lỡ và gợi ý reschedule
            await notification_service_1.notificationService.create({
                userId,
                type: notification_model_1.NotificationType.SYSTEM,
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
            console.log(`[ReminderCron] Sent missed task alert for task: ${task.title} to user: ${userId}`);
        }
    }
    catch (err) {
        console.error("[ReminderCron] Error scanning missed tasks:", err);
    }
}
// Kiểm tra đã có reminder gần đây cho task chưa (trong 24h qua)
async function hasRecentReminder(userId, taskId, type = notification_model_1.NotificationType.DEADLINE_ALERT) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingNotification = await notification_repository_1.notificationRepository.findRecentByTaskAndType(taskId, userId, type, twentyFourHoursAgo);
    return !!existingNotification;
}
// Manual trigger (cho testing)
const triggerDeadlineScan = async () => {
    console.log("[ReminderCron] Manual trigger started");
    await scanAndNotifyDeadlines();
    await scanAndNotifyScheduledTasks();
    await scanAndNotifyAIScheduleTasks();
    await scanAndNotifyMissedTasks();
    await resurrectSnoozedTick();
    await digestTick();
    console.log("[ReminderCron] Manual trigger completed");
};
exports.triggerDeadlineScan = triggerDeadlineScan;
// Tick for resurrecting snoozed notifications whose snoozedUntil has elapsed
async function resurrectSnoozedTick() {
    try {
        const n = await notification_service_1.notificationService.resurrectSnoozed();
        if (n > 0) {
            console.log(`[ReminderCron] Resurrected ${n} snoozed notification(s)`);
        }
    }
    catch (err) {
        console.error("[ReminderCron] Error resurrecting snoozed:", err);
    }
}
