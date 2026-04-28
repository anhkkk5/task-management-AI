import { Types } from "mongoose";
import { notificationRepository } from "./notification.repository";
import { notificationGateway } from "./notification.gateway";
import {
  NotificationType,
  NotificationPriority,
  NotificationDoc,
} from "./notification.model";
import { notificationQueue } from "./notification.queue";
import { userRepository } from "../user/user.repository";

export type PublicNotification = {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  content: string;
  message: string; // alias for content, for FE compatibility
  data?: any;
  isRead: boolean;
  channels: {
    inApp: boolean;
    email: boolean;
    push?: boolean;
  };
  snoozedUntil?: Date | null;
  isGroup?: boolean;
  groupCount?: number;
  groupedIds?: string[];
  createdAt: Date;
};

const toPublicNotification = (doc: NotificationDoc): PublicNotification => {
  return {
    id: String(doc._id),
    type: doc.type,
    priority: doc.priority || NotificationPriority.NORMAL,
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

function resolvePriority(
  type: NotificationType,
  data: any,
): NotificationPriority {
  const now = Date.now();
  const deadline = data?.deadline ? new Date(data.deadline).getTime() : null;
  const timeToDeadline = deadline ? deadline - now : null;
  const taskPriority: string | undefined = data?.taskPriority;

  switch (type) {
    case NotificationType.DEADLINE_ALERT: {
      if (taskPriority === "urgent") return NotificationPriority.CRITICAL;
      if (timeToDeadline !== null && timeToDeadline < 60 * 60 * 1000)
        return NotificationPriority.CRITICAL;
      if (taskPriority === "high") return NotificationPriority.HIGH;
      if (timeToDeadline !== null && timeToDeadline < 3 * 60 * 60 * 1000)
        return NotificationPriority.HIGH;
      return NotificationPriority.NORMAL;
    }
    case NotificationType.SYSTEM:
      // Missed tasks → HIGH
      return data?.reason === "missed"
        ? NotificationPriority.HIGH
        : NotificationPriority.NORMAL;
    case NotificationType.SCHEDULED_TASK_ALERT:
      return taskPriority === "urgent"
        ? NotificationPriority.HIGH
        : NotificationPriority.NORMAL;
    case NotificationType.CHAT_MESSAGE:
      return NotificationPriority.NORMAL;
    case NotificationType.AI_SUGGESTION:
      return NotificationPriority.LOW;
    case NotificationType.TEAM_TASK_ASSIGNED:
      return taskPriority === "urgent"
        ? NotificationPriority.HIGH
        : NotificationPriority.NORMAL;
    case NotificationType.TEAM_TASK_REASSIGNED:
      return taskPriority === "urgent"
        ? NotificationPriority.HIGH
        : NotificationPriority.NORMAL;
    case NotificationType.TEAM_TASK_STATUS_CHANGED:
      return NotificationPriority.NORMAL;
    case NotificationType.TEAM_TASK_UPDATED:
      return NotificationPriority.LOW;
    case NotificationType.TEAM_TASK_COMMENT:
      return NotificationPriority.NORMAL;
    case NotificationType.TEAM_TASK_MENTION:
      return NotificationPriority.HIGH;
    default:
      return NotificationPriority.NORMAL;
  }
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type DigestSettings = {
  enabled: boolean;
  frequency: "daily" | "weekly";
  time: string;
  includeTypes?: string[];
  lastSentAt?: string;
};

function isDigestDue(now: Date, digest: DigestSettings): boolean {
  if (!digest.enabled) return false;
  const target = parseHHmmToMinutes(digest.time);
  if (target === null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (cur !== target) return false;

  if (!digest.lastSentAt) return true;
  const last = new Date(digest.lastSentAt);
  if (isNaN(last.getTime())) return true;

  if (digest.frequency === "weekly") {
    return now.getTime() - last.getTime() >= 7 * 24 * 60 * 60 * 1000;
  }
  return !isSameLocalDate(now, last);
}

function generateDigestEmailHtml(params: {
  title: string;
  total: number;
  byType: Array<{ type: string; count: number }>;
  recent: Array<{ title: string; content: string; createdAt: Date }>;
}): string {
  const byTypeRows = params.byType
    .map((r) => `<li><strong>${r.count}</strong> • ${r.type}</li>`)
    .join("");

  const recentRows = params.recent
    .map(
      (n) =>
        `<li><strong>${escapeHtml(n.title)}</strong><br/><span style="color:#555">${escapeHtml(n.content)}</span></li>`,
    )
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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface QuietHours {
  enabled: boolean;
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

function parseHHmmToMinutes(hhmm: string | undefined): number | null {
  if (!hhmm || typeof hhmm !== "string") return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (isNaN(h) || isNaN(mm) || h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

function isWithinQuietHours(q: QuietHours | undefined, now = new Date()) {
  if (!q || !q.enabled) return false;
  const start = parseHHmmToMinutes(q.start);
  const end = parseHHmmToMinutes(q.end);
  if (start === null || end === null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end; // same-day window
  return cur >= start || cur < end; // overnight window (e.g. 22:00 → 07:00)
}

async function getUserNotificationPrefs(userId: string): Promise<{
  quietHours?: QuietHours;
  groupingEnabled: boolean;
  email?: string;
}> {
  try {
    const user = await userRepository.findById(userId);
    if (!user) return { groupingEnabled: true };
    const s: any = (user as any).settings?.notifications || {};
    return {
      quietHours: s.quietHours,
      groupingEnabled: s.groupingEnabled !== false, // default true
      email: (user as any).email,
    };
  } catch {
    return { groupingEnabled: true };
  }
}

// Build a concise title/content for a grouped notification based on type + count
function buildGroupSummary(
  type: NotificationType,
  count: number,
): { title: string; content: string } {
  const labelMap: Record<NotificationType, string> = {
    [NotificationType.DEADLINE_ALERT]: "công việc sắp đến hạn",
    [NotificationType.SCHEDULED_TASK_ALERT]: "công việc sắp bắt đầu",
    [NotificationType.TASK_REMINDER]: "nhắc nhở công việc",
    [NotificationType.CHAT_MESSAGE]: "tin nhắn mới",
    [NotificationType.AI_SUGGESTION]: "gợi ý từ AI",
    [NotificationType.TEAM_TASK_ASSIGNED]: "công việc nhóm mới được giao",
    [NotificationType.TEAM_TASK_REASSIGNED]:
      "công việc nhóm được chuyển người phụ trách",
    [NotificationType.TEAM_TASK_STATUS_CHANGED]:
      "cập nhật trạng thái công việc nhóm",
    [NotificationType.TEAM_TASK_UPDATED]: "cập nhật công việc nhóm",
    [NotificationType.TEAM_TASK_COMMENT]: "bình luận mới trong công việc nhóm",
    [NotificationType.TEAM_TASK_MENTION]: "lượt nhắc tên trong công việc nhóm",
    [NotificationType.SYSTEM]: "cập nhật hệ thống",
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
async function applyGrouping(
  userIdObj: Types.ObjectId,
  type: NotificationType,
  newNotifId: Types.ObjectId,
): Promise<NotificationDoc | null> {
  // 1) If an active group parent already exists → append new noti to it
  const existingGroup = await notificationRepository.findActiveGroup(
    userIdObj,
    type,
    GROUP_WINDOW_MINUTES,
  );

  if (existingGroup) {
    // Hide the new noti (absorb) + bump group count/content
    await notificationRepository.absorbIntoGroup(
      existingGroup._id as Types.ObjectId,
      [newNotifId],
    );
    const nextCount = (existingGroup.groupCount || 0) + 1;
    const summary = buildGroupSummary(type, nextCount);
    const updated = await notificationRepository.appendToGroup(
      existingGroup._id as Types.ObjectId,
      newNotifId,
      summary.title,
      summary.content,
    );
    return updated || existingGroup;
  }

  // 2) No group yet → count siblings. If threshold met, promote the new noti.
  const siblings = await notificationRepository.findGroupableSiblings(
    userIdObj,
    type,
    GROUP_WINDOW_MINUTES,
    newNotifId,
  );
  if (siblings.length + 1 < GROUP_TRIGGER_THRESHOLD) return null;

  const siblingIds = siblings.map((s: any) => s._id as Types.ObjectId);
  const totalCount = siblingIds.length + 1;
  const summary = buildGroupSummary(type, totalCount);

  // Hide siblings behind new noti (promote new noti to group parent)
  await notificationRepository.absorbIntoGroup(newNotifId, siblingIds);
  const promoted = await notificationRepository.promoteToGroup(
    newNotifId,
    siblingIds,
    summary.title,
    summary.content,
  );
  return promoted || null;
}

/**
 * Compute snooze-until date from a short token or custom minutes number.
 */
function computeSnoozeUntil(
  duration: "15min" | "1hour" | "3hour" | "tomorrow" | number,
): Date {
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

export const notificationService = {
  create: async (data: {
    userId: string;
    type: NotificationType;
    priority?: NotificationPriority;
    title: string;
    content: string;
    data?: any;
    channels?: { inApp?: boolean; email?: boolean; push?: boolean };
  }): Promise<PublicNotification> => {
    const priority = data.priority || resolvePriority(data.type, data.data);

    const prefs = await getUserNotificationPrefs(data.userId);

    let emailChannel = data.channels?.email ?? false;
    if (
      emailChannel &&
      priority !== NotificationPriority.CRITICAL &&
      isWithinQuietHours(prefs.quietHours)
    ) {
      emailChannel = false;
    }

    const notification = await notificationRepository.create({
      userId: new Types.ObjectId(data.userId),
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
        const groupResult = await applyGrouping(
          new Types.ObjectId(data.userId),
          data.type,
          notification._id as Types.ObjectId,
        );
        if (groupResult) {
          // Hide this new notification → emit delete for its ID (FE will drop)
          notificationGateway.emitDelete?.(
            data.userId,
            String(notification._id),
          );
          // Emit group parent (new or updated)
          notificationGateway.emitToUser(
            data.userId,
            toPublicNotification(groupResult),
          );
          groupedEmitted = true;
        }
      } catch (err) {
        console.error("[NotificationService] Grouping error:", err);
      }
    }

    if (!groupedEmitted && publicNotification.channels.inApp) {
      notificationGateway.emitToUser(data.userId, publicNotification);
    }

    if (notification.channels.email) {
      try {
        await notificationQueue.add(
          "send-email",
          {
            userId: data.userId,
            email: data.data?.userEmail || prefs.email || "user@example.com",
            subject: data.title,
            html: generateEmailHtml(data.title, data.content),
            notificationId: String(notification._id),
          },
          {
            priority: 2,
            attempts: 5,
            backoff: {
              type: "exponential",
              delay: 5000,
            },
          },
        );
      } catch (err) {
        console.error("[NotificationService] Failed to queue email job:", err);
      }
    }

    return publicNotification;
  },

  snooze: async (
    notificationId: string,
    userId: string,
    duration: "15min" | "1hour" | "3hour" | "tomorrow" | number,
  ): Promise<PublicNotification | null> => {
    const until = computeSnoozeUntil(duration);
    const updated = await notificationRepository.snooze(
      notificationId,
      new Types.ObjectId(userId),
      until,
    );
    if (!updated) return null;
    // Emit realtime hide (FE removes from main list)
    notificationGateway.emitDelete?.(userId, notificationId);
    return toPublicNotification(updated);
  },

  unsnooze: async (
    notificationId: string,
    userId: string,
  ): Promise<PublicNotification | null> => {
    const updated = await notificationRepository.unsnooze(
      notificationId,
      new Types.ObjectId(userId),
    );
    if (!updated) return null;
    const pub = toPublicNotification(updated);
    notificationGateway.emitToUser(userId, pub);
    return pub;
  },

  listSnoozed: async (userId: string): Promise<PublicNotification[]> => {
    const docs = await notificationRepository.listSnoozed(
      new Types.ObjectId(userId),
    );
    return docs.map((doc) => toPublicNotification(doc as any));
  },

  listGroupChildren: async (
    parentId: string,
    userId: string,
  ): Promise<PublicNotification[]> => {
    // Verify ownership of group parent first
    const parent = await notificationRepository.findByIdAndUser(
      parentId,
      new Types.ObjectId(userId),
    );
    if (!parent) return [];
    const docs = await notificationRepository.findGroupChildren(
      new Types.ObjectId(parentId),
    );
    return docs.map((doc) => toPublicNotification(doc as any));
  },

  resurrectSnoozed: async (): Promise<number> => {
    const expired = await notificationRepository.findExpiredSnoozes(500);
    if (!expired.length) return 0;
    const ids = expired.map((n: any) => n._id);
    await notificationRepository.clearExpiredSnoozes(ids);
    for (const doc of expired) {
      try {
        notificationGateway.emitToUser(
          String(doc.userId),
          toPublicNotification(doc as any),
        );
      } catch (err) {
        console.error("[NotificationService] resurrect emit error:", err);
      }
    }
    return expired.length;
  },

  sendDigestForDueUsers: async (now: Date = new Date()): Promise<number> => {
    const users = await userRepository.findDigestEnabledUsers();
    let sent = 0;

    for (const user of users as any[]) {
      const userId = String(user._id);
      const email = String(user.email || "").trim();
      if (!email) continue;

      const digest = ((user.settings as any)?.notifications?.digest || {
        enabled: false,
        frequency: "daily",
        time: "08:00",
      }) as DigestSettings;

      if (!isDigestDue(now, digest)) continue;

      const since =
        digest.frequency === "weekly"
          ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          : new Date(now.getTime() - 24 * 60 * 60 * 1000);

      let unread = await notificationRepository.getUnreadSince(
        new Types.ObjectId(userId),
        since,
        50,
      );

      if (digest.includeTypes && digest.includeTypes.length > 0) {
        const allow = new Set(digest.includeTypes.map((x) => String(x)));
        unread = unread.filter((n: any) => allow.has(String(n.type)));
      }

      if (!unread.length) {
        continue;
      }

      const byTypeRaw = await notificationRepository.aggregateUnreadByTypeSince(
        new Types.ObjectId(userId),
        since,
      );

      const byType = (
        digest.includeTypes && digest.includeTypes.length > 0
          ? byTypeRaw.filter((x: any) =>
              digest.includeTypes!.includes(String(x.type)),
            )
          : byTypeRaw
      ).map((x: any) => ({
        type: String(x.type),
        count: Number(x.count || 0),
      }));

      const periodLabel = digest.frequency === "weekly" ? "tuần" : "ngày";
      const subject = `📊 Digest ${periodLabel}: ${unread.length} thông báo chưa đọc`;
      const html = generateDigestEmailHtml({
        title: `Tóm tắt thông báo ${periodLabel}`,
        total: unread.length,
        byType,
        recent: unread.slice(0, 8).map((n: any) => ({
          title: String(n.title || "Thông báo"),
          content: String(n.content || ""),
          createdAt: new Date(n.createdAt),
        })),
      });

      await notificationQueue.add("send-email", {
        userId,
        email,
        subject,
        html,
        notificationId: `digest-${userId}-${Date.now()}`,
      });

      // Persist lastSentAt
      const existingSettings =
        ((user.settings || {}) as Record<string, unknown>) || {};
      const existingNotif =
        ((existingSettings as any).notifications as Record<string, unknown>) ||
        {};
      const prevDigest =
        ((existingNotif as any).digest as Record<string, unknown>) || {};

      await userRepository.updateProfile(userId, {
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

  list: async (
    userId: string,
    options: {
      isRead?: boolean;
      type?: NotificationType;
      limit?: number;
      offset?: number;
    } = {},
  ): Promise<PublicNotification[]> => {
    const notifications = await notificationRepository.listForUser(
      new Types.ObjectId(userId),
      options,
    );
    return notifications.map(toPublicNotification);
  },

  countUnread: async (userId: string): Promise<number> => {
    return notificationRepository.countUnread(new Types.ObjectId(userId));
  },

  markAsRead: async (
    notificationId: string,
    userId: string,
  ): Promise<PublicNotification | null> => {
    const updated = await notificationRepository.markAsRead(
      notificationId,
      new Types.ObjectId(userId),
    );
    if (!updated) return null;

    const publicNotification = toPublicNotification(updated);

    notificationGateway.emitReadUpdate(userId, {
      notificationId: String(notificationId),
      isRead: true,
    });

    return publicNotification;
  },

  markAllAsRead: async (userId: string): Promise<void> => {
    await notificationRepository.markAllAsRead(new Types.ObjectId(userId));
  },

  delete: async (notificationId: string, userId: string): Promise<boolean> => {
    return notificationRepository.delete(
      notificationId,
      new Types.ObjectId(userId),
    );
  },
};

function generateEmailHtml(title: string, content: string): string {
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
