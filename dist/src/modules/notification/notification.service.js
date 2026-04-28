"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = void 0;
const mongoose_1 = require("mongoose");
const notification_repository_1 = require("./notification.repository");
const notification_gateway_1 = require("./notification.gateway");
const notification_model_1 = require("./notification.model");
const notification_queue_1 = require("./notification.queue");
const user_repository_1 = require("../user/user.repository");
const toPublicNotification = (doc) => {
    return {
        id: String(doc._id),
        type: doc.type,
        priority: doc.priority || notification_model_1.NotificationPriority.NORMAL,
        title: doc.title,
        content: doc.content,
        message: doc.content, // alias for FE compatibility
        data: doc.data,
        isRead: doc.isRead,
        channels: doc.channels,
        snoozedUntil: doc.snoozedUntil || null,
        isGroup: doc.isGroup || false,
        groupCount: doc.groupCount || 0,
        groupedIds: (doc.groupedIds || []).map((id) => String(id)),
        createdAt: doc.createdAt,
    };
};
function resolvePriority(type, data) {
    const now = Date.now();
    const deadline = data?.deadline ? new Date(data.deadline).getTime() : null;
    const timeToDeadline = deadline ? deadline - now : null;
    const taskPriority = data?.taskPriority;
    switch (type) {
        case notification_model_1.NotificationType.DEADLINE_ALERT: {
            if (taskPriority === "urgent")
                return notification_model_1.NotificationPriority.CRITICAL;
            if (timeToDeadline !== null && timeToDeadline < 60 * 60 * 1000)
                return notification_model_1.NotificationPriority.CRITICAL;
            if (taskPriority === "high")
                return notification_model_1.NotificationPriority.HIGH;
            if (timeToDeadline !== null && timeToDeadline < 3 * 60 * 60 * 1000)
                return notification_model_1.NotificationPriority.HIGH;
            return notification_model_1.NotificationPriority.NORMAL;
        }
        case notification_model_1.NotificationType.SYSTEM:
            // Missed tasks → HIGH
            return data?.reason === "missed"
                ? notification_model_1.NotificationPriority.HIGH
                : notification_model_1.NotificationPriority.NORMAL;
        case notification_model_1.NotificationType.SCHEDULED_TASK_ALERT:
            return taskPriority === "urgent"
                ? notification_model_1.NotificationPriority.HIGH
                : notification_model_1.NotificationPriority.NORMAL;
        case notification_model_1.NotificationType.CHAT_MESSAGE:
            return notification_model_1.NotificationPriority.NORMAL;
        case notification_model_1.NotificationType.AI_SUGGESTION:
            return notification_model_1.NotificationPriority.LOW;
        case notification_model_1.NotificationType.TEAM_TASK_ASSIGNED:
            return taskPriority === "urgent"
                ? notification_model_1.NotificationPriority.HIGH
                : notification_model_1.NotificationPriority.NORMAL;
        case notification_model_1.NotificationType.TEAM_TASK_REASSIGNED:
            return taskPriority === "urgent"
                ? notification_model_1.NotificationPriority.HIGH
                : notification_model_1.NotificationPriority.NORMAL;
        case notification_model_1.NotificationType.TEAM_TASK_STATUS_CHANGED:
            return notification_model_1.NotificationPriority.NORMAL;
        case notification_model_1.NotificationType.TEAM_TASK_UPDATED:
            return notification_model_1.NotificationPriority.LOW;
        case notification_model_1.NotificationType.TEAM_TASK_COMMENT:
            return notification_model_1.NotificationPriority.NORMAL;
        case notification_model_1.NotificationType.TEAM_TASK_MENTION:
            return notification_model_1.NotificationPriority.HIGH;
        default:
            return notification_model_1.NotificationPriority.NORMAL;
    }
}
function isSameLocalDate(a, b) {
    return (a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate());
}
function isDigestDue(now, digest) {
    if (!digest.enabled)
        return false;
    const target = parseHHmmToMinutes(digest.time);
    if (target === null)
        return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    if (cur !== target)
        return false;
    if (!digest.lastSentAt)
        return true;
    const last = new Date(digest.lastSentAt);
    if (isNaN(last.getTime()))
        return true;
    if (digest.frequency === "weekly") {
        return now.getTime() - last.getTime() >= 7 * 24 * 60 * 60 * 1000;
    }
    return !isSameLocalDate(now, last);
}
function generateDigestEmailHtml(params) {
    const byTypeRows = params.byType
        .map((r) => `<li><strong>${r.count}</strong> • ${r.type}</li>`)
        .join("");
    const recentRows = params.recent
        .map((n) => `<li><strong>${escapeHtml(n.title)}</strong><br/><span style="color:#555">${escapeHtml(n.content)}</span></li>`)
        .join("");
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="font-family:Arial,sans-serif;background:#f6f8fa;padding:20px;color:#111;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;">
    <h2 style="margin:0 0 12px 0;color:#0f7985;">${escapeHtml(params.title)}</h2>
    <p style="margin:0 0 14px 0;">Bạn có <strong>${params.total}</strong> thông báo chưa đọc trong kỳ.</p>
    <h3 style="margin:14px 0 8px 0;font-size:15px;">Theo loại</h3>
    <ul style="margin:0 0 16px 18px;padding:0;">${byTypeRows || "<li>Không có dữ liệu</li>"}</ul>
    <h3 style="margin:14px 0 8px 0;font-size:15px;">Thông báo gần đây</h3>
    <ul style="margin:0 0 16px 18px;padding:0;line-height:1.5;">${recentRows || "<li>Không có dữ liệu</li>"}</ul>
    <p style="font-size:12px;color:#666;margin-top:20px;">Bạn có thể thay đổi cài đặt Digest trong phần Thông báo.</p>
  </div>
</body>
</html>`;
}
function escapeHtml(input) {
    return input
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
function parseHHmmToMinutes(hhmm) {
    if (!hhmm || typeof hhmm !== "string")
        return null;
    const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
    if (!m)
        return null;
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (isNaN(h) || isNaN(mm) || h > 23 || mm > 59)
        return null;
    return h * 60 + mm;
}
function isWithinQuietHours(q, now = new Date()) {
    if (!q || !q.enabled)
        return false;
    const start = parseHHmmToMinutes(q.start);
    const end = parseHHmmToMinutes(q.end);
    if (start === null || end === null)
        return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    if (start === end)
        return false;
    if (start < end)
        return cur >= start && cur < end; // same-day window
    return cur >= start || cur < end; // overnight window (e.g. 22:00 → 07:00)
}
async function getUserNotificationPrefs(userId) {
    try {
        const user = await user_repository_1.userRepository.findById(userId);
        if (!user)
            return { groupingEnabled: true };
        const s = user.settings?.notifications || {};
        return {
            quietHours: s.quietHours,
            groupingEnabled: s.groupingEnabled !== false, // default true
            email: user.email,
        };
    }
    catch {
        return { groupingEnabled: true };
    }
}
// Build a concise title/content for a grouped notification based on type + count
function buildGroupSummary(type, count) {
    const labelMap = {
        [notification_model_1.NotificationType.DEADLINE_ALERT]: "công việc sắp đến hạn",
        [notification_model_1.NotificationType.SCHEDULED_TASK_ALERT]: "công việc sắp bắt đầu",
        [notification_model_1.NotificationType.TASK_REMINDER]: "nhắc nhở công việc",
        [notification_model_1.NotificationType.CHAT_MESSAGE]: "tin nhắn mới",
        [notification_model_1.NotificationType.AI_SUGGESTION]: "gợi ý từ AI",
        [notification_model_1.NotificationType.TEAM_TASK_ASSIGNED]: "công việc nhóm mới được giao",
        [notification_model_1.NotificationType.TEAM_TASK_REASSIGNED]: "công việc nhóm được chuyển người phụ trách",
        [notification_model_1.NotificationType.TEAM_TASK_STATUS_CHANGED]: "cập nhật trạng thái công việc nhóm",
        [notification_model_1.NotificationType.TEAM_TASK_UPDATED]: "cập nhật công việc nhóm",
        [notification_model_1.NotificationType.TEAM_TASK_COMMENT]: "bình luận mới trong công việc nhóm",
        [notification_model_1.NotificationType.TEAM_TASK_MENTION]: "lượt nhắc tên trong công việc nhóm",
        [notification_model_1.NotificationType.SYSTEM]: "cập nhật hệ thống",
    };
    const label = labelMap[type] || "thông báo";
    return {
        title: `Bạn có ${count} ${label}`,
        content: `Nhấn để xem chi tiết ${count} ${label}.`,
    };
}
const GROUP_WINDOW_MINUTES = 60;
const GROUP_TRIGGER_THRESHOLD = 3;
/**
 * Apply smart grouping strategy for a newly-created notification.
 * Returns the group parent doc when the new noti was absorbed into a group,
 * or null when it stays standalone.
 */
async function applyGrouping(userIdObj, type, newNotifId) {
    // 1) If an active group parent already exists → append new noti to it
    const existingGroup = await notification_repository_1.notificationRepository.findActiveGroup(userIdObj, type, GROUP_WINDOW_MINUTES);
    if (existingGroup) {
        // Hide the new noti (absorb) + bump group count/content
        await notification_repository_1.notificationRepository.absorbIntoGroup(existingGroup._id, [newNotifId]);
        const nextCount = (existingGroup.groupCount || 0) + 1;
        const summary = buildGroupSummary(type, nextCount);
        const updated = await notification_repository_1.notificationRepository.appendToGroup(existingGroup._id, newNotifId, summary.title, summary.content);
        return updated || existingGroup;
    }
    // 2) No group yet → count siblings. If threshold met, promote the new noti.
    const siblings = await notification_repository_1.notificationRepository.findGroupableSiblings(userIdObj, type, GROUP_WINDOW_MINUTES, newNotifId);
    if (siblings.length + 1 < GROUP_TRIGGER_THRESHOLD)
        return null;
    const siblingIds = siblings.map((s) => s._id);
    const totalCount = siblingIds.length + 1;
    const summary = buildGroupSummary(type, totalCount);
    // Hide siblings behind new noti (promote new noti to group parent)
    await notification_repository_1.notificationRepository.absorbIntoGroup(newNotifId, siblingIds);
    const promoted = await notification_repository_1.notificationRepository.promoteToGroup(newNotifId, siblingIds, summary.title, summary.content);
    return promoted || null;
}
/**
 * Compute snooze-until date from a short token or custom minutes number.
 */
function computeSnoozeUntil(duration) {
    const now = new Date();
    if (typeof duration === "number") {
        return new Date(now.getTime() + Math.max(1, duration) * 60 * 1000);
    }
    switch (duration) {
        case "15min":
            return new Date(now.getTime() + 15 * 60 * 1000);
        case "1hour":
            return new Date(now.getTime() + 60 * 60 * 1000);
        case "3hour":
            return new Date(now.getTime() + 3 * 60 * 60 * 1000);
        case "tomorrow": {
            const d = new Date(now);
            d.setDate(d.getDate() + 1);
            d.setHours(9, 0, 0, 0); // 9:00 next morning
            return d;
        }
        default:
            return new Date(now.getTime() + 60 * 60 * 1000);
    }
}
exports.notificationService = {
    create: async (data) => {
        const priority = data.priority || resolvePriority(data.type, data.data);
        const prefs = await getUserNotificationPrefs(data.userId);
        let emailChannel = data.channels?.email ?? false;
        if (emailChannel &&
            priority !== notification_model_1.NotificationPriority.CRITICAL &&
            isWithinQuietHours(prefs.quietHours)) {
            emailChannel = false;
        }
        const notification = await notification_repository_1.notificationRepository.create({
            userId: new mongoose_1.Types.ObjectId(data.userId),
            type: data.type,
            priority,
            title: data.title,
            content: data.content,
            data: data.data || {},
            isRead: false,
            channels: {
                inApp: data.channels?.inApp ?? true,
                email: emailChannel,
                push: data.channels?.push ?? false,
            },
        });
        let publicNotification = toPublicNotification(notification);
        let groupedEmitted = false;
        if (prefs.groupingEnabled) {
            try {
                const groupResult = await applyGrouping(new mongoose_1.Types.ObjectId(data.userId), data.type, notification._id);
                if (groupResult) {
                    // Hide this new notification → emit delete for its ID (FE will drop)
                    notification_gateway_1.notificationGateway.emitDelete?.(data.userId, String(notification._id));
                    // Emit group parent (new or updated)
                    notification_gateway_1.notificationGateway.emitToUser(data.userId, toPublicNotification(groupResult));
                    groupedEmitted = true;
                }
            }
            catch (err) {
                console.error("[NotificationService] Grouping error:", err);
            }
        }
        if (!groupedEmitted && publicNotification.channels.inApp) {
            notification_gateway_1.notificationGateway.emitToUser(data.userId, publicNotification);
        }
        if (notification.channels.email) {
            try {
                await notification_queue_1.notificationQueue.add("send-email", {
                    userId: data.userId,
                    email: data.data?.userEmail || prefs.email || "user@example.com",
                    subject: data.title,
                    html: generateEmailHtml(data.title, data.content),
                    notificationId: String(notification._id),
                }, {
                    priority: 2,
                    attempts: 5,
                    backoff: {
                        type: "exponential",
                        delay: 5000,
                    },
                });
            }
            catch (err) {
                console.error("[NotificationService] Failed to queue email job:", err);
            }
        }
        return publicNotification;
    },
    snooze: async (notificationId, userId, duration) => {
        const until = computeSnoozeUntil(duration);
        const updated = await notification_repository_1.notificationRepository.snooze(notificationId, new mongoose_1.Types.ObjectId(userId), until);
        if (!updated)
            return null;
        // Emit realtime hide (FE removes from main list)
        notification_gateway_1.notificationGateway.emitDelete?.(userId, notificationId);
        return toPublicNotification(updated);
    },
    unsnooze: async (notificationId, userId) => {
        const updated = await notification_repository_1.notificationRepository.unsnooze(notificationId, new mongoose_1.Types.ObjectId(userId));
        if (!updated)
            return null;
        const pub = toPublicNotification(updated);
        notification_gateway_1.notificationGateway.emitToUser(userId, pub);
        return pub;
    },
    listSnoozed: async (userId) => {
        const docs = await notification_repository_1.notificationRepository.listSnoozed(new mongoose_1.Types.ObjectId(userId));
        return docs.map((doc) => toPublicNotification(doc));
    },
    listGroupChildren: async (parentId, userId) => {
        // Verify ownership of group parent first
        const parent = await notification_repository_1.notificationRepository.findByIdAndUser(parentId, new mongoose_1.Types.ObjectId(userId));
        if (!parent)
            return [];
        const docs = await notification_repository_1.notificationRepository.findGroupChildren(new mongoose_1.Types.ObjectId(parentId));
        return docs.map((doc) => toPublicNotification(doc));
    },
    resurrectSnoozed: async () => {
        const expired = await notification_repository_1.notificationRepository.findExpiredSnoozes(500);
        if (!expired.length)
            return 0;
        const ids = expired.map((n) => n._id);
        await notification_repository_1.notificationRepository.clearExpiredSnoozes(ids);
        for (const doc of expired) {
            try {
                notification_gateway_1.notificationGateway.emitToUser(String(doc.userId), toPublicNotification(doc));
            }
            catch (err) {
                console.error("[NotificationService] resurrect emit error:", err);
            }
        }
        return expired.length;
    },
    sendDigestForDueUsers: async (now = new Date()) => {
        const users = await user_repository_1.userRepository.findDigestEnabledUsers();
        let sent = 0;
        for (const user of users) {
            const userId = String(user._id);
            const email = String(user.email || "").trim();
            if (!email)
                continue;
            const digest = (user.settings?.notifications?.digest || {
                enabled: false,
                frequency: "daily",
                time: "08:00",
            });
            if (!isDigestDue(now, digest))
                continue;
            const since = digest.frequency === "weekly"
                ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                : new Date(now.getTime() - 24 * 60 * 60 * 1000);
            let unread = await notification_repository_1.notificationRepository.getUnreadSince(new mongoose_1.Types.ObjectId(userId), since, 50);
            if (digest.includeTypes && digest.includeTypes.length > 0) {
                const allow = new Set(digest.includeTypes.map((x) => String(x)));
                unread = unread.filter((n) => allow.has(String(n.type)));
            }
            if (!unread.length) {
                continue;
            }
            const byTypeRaw = await notification_repository_1.notificationRepository.aggregateUnreadByTypeSince(new mongoose_1.Types.ObjectId(userId), since);
            const byType = (digest.includeTypes && digest.includeTypes.length > 0
                ? byTypeRaw.filter((x) => digest.includeTypes.includes(String(x.type)))
                : byTypeRaw).map((x) => ({
                type: String(x.type),
                count: Number(x.count || 0),
            }));
            const periodLabel = digest.frequency === "weekly" ? "tuần" : "ngày";
            const subject = `📊 Digest ${periodLabel}: ${unread.length} thông báo chưa đọc`;
            const html = generateDigestEmailHtml({
                title: `Tóm tắt thông báo ${periodLabel}`,
                total: unread.length,
                byType,
                recent: unread.slice(0, 8).map((n) => ({
                    title: String(n.title || "Thông báo"),
                    content: String(n.content || ""),
                    createdAt: new Date(n.createdAt),
                })),
            });
            await notification_queue_1.notificationQueue.add("send-email", {
                userId,
                email,
                subject,
                html,
                notificationId: `digest-${userId}-${Date.now()}`,
            });
            // Persist lastSentAt
            const existingSettings = (user.settings || {}) || {};
            const existingNotif = existingSettings.notifications ||
                {};
            const prevDigest = existingNotif.digest || {};
            await user_repository_1.userRepository.updateProfile(userId, {
                settings: {
                    ...existingSettings,
                    notifications: {
                        ...existingNotif,
                        digest: {
                            ...prevDigest,
                            enabled: true,
                            frequency: digest.frequency,
                            time: digest.time,
                            ...(digest.includeTypes
                                ? { includeTypes: digest.includeTypes }
                                : {}),
                            lastSentAt: now.toISOString(),
                        },
                    },
                },
            });
            sent += 1;
        }
        return sent;
    },
    list: async (userId, options = {}) => {
        const notifications = await notification_repository_1.notificationRepository.listForUser(new mongoose_1.Types.ObjectId(userId), options);
        return notifications.map(toPublicNotification);
    },
    countUnread: async (userId) => {
        return notification_repository_1.notificationRepository.countUnread(new mongoose_1.Types.ObjectId(userId));
    },
    markAsRead: async (notificationId, userId) => {
        const updated = await notification_repository_1.notificationRepository.markAsRead(notificationId, new mongoose_1.Types.ObjectId(userId));
        if (!updated)
            return null;
        const publicNotification = toPublicNotification(updated);
        notification_gateway_1.notificationGateway.emitReadUpdate(userId, {
            notificationId: String(notificationId),
            isRead: true,
        });
        return publicNotification;
    },
    markAllAsRead: async (userId) => {
        await notification_repository_1.notificationRepository.markAllAsRead(new mongoose_1.Types.ObjectId(userId));
    },
    delete: async (notificationId, userId) => {
        return notification_repository_1.notificationRepository.delete(notificationId, new mongoose_1.Types.ObjectId(userId));
    },
};
function generateEmailHtml(title, content) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 5px; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${title}</h1>
    </div>
    <div class="content">
      <p>${content}</p>
    </div>
    <div class="footer">
      <p>Email này được gửi tự động từ Task Management System</p>
    </div>
  </div>
</body>
</html>
`;
}
