import { Types } from "mongoose";
import { notificationRepository } from "./notification.repository";
import { notificationGateway } from "./notification.gateway";
import { NotificationType, NotificationDoc } from "./notification.model";
import { notificationQueue } from "./notification.queue";

export type PublicNotification = {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  data?: any;
  isRead: boolean;
  channels: {
    inApp: boolean;
    email: boolean;
    push?: boolean;
  };
  createdAt: Date;
};

const toPublicNotification = (doc: NotificationDoc): PublicNotification => {
  return {
    id: String(doc._id),
    type: doc.type,
    title: doc.title,
    content: doc.content,
    data: doc.data,
    isRead: doc.isRead,
    channels: doc.channels,
    createdAt: doc.createdAt,
  };
};

export const notificationService = {
  // Create and emit notification
  create: async (data: {
    userId: string;
    type: NotificationType;
    title: string;
    content: string;
    data?: any;
    channels?: { inApp?: boolean; email?: boolean; push?: boolean };
  }): Promise<PublicNotification> => {
    const notification = await notificationRepository.create({
      userId: new Types.ObjectId(data.userId),
      type: data.type,
      title: data.title,
      content: data.content,
      data: data.data || {},
      isRead: false,
      channels: {
        inApp: data.channels?.inApp ?? true,
        email: data.channels?.email ?? false,
        push: data.channels?.push ?? false,
      },
    });

    const publicNotification = toPublicNotification(notification);

    // Emit realtime notification if inApp channel enabled
    if (publicNotification.channels.inApp) {
      notificationGateway.emitToUser(data.userId, publicNotification);
    }

    // Queue email job if email channel enabled
    if (publicNotification.channels.email) {
      try {
        await notificationQueue.add(
          "send-email",
          {
            userId: data.userId,
            email: data.data?.userEmail || "user@example.com", // TODO: Get from user service
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

  // List notifications for user
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

  // Count unread notifications
  countUnread: async (userId: string): Promise<number> => {
    return notificationRepository.countUnread(new Types.ObjectId(userId));
  },

  // Mark as read
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

    // Emit read update realtime
    notificationGateway.emitReadUpdate(userId, {
      notificationId: String(notificationId),
      isRead: true,
    });

    return publicNotification;
  },

  // Mark all as read
  markAllAsRead: async (userId: string): Promise<void> => {
    await notificationRepository.markAllAsRead(new Types.ObjectId(userId));
  },
};

// Generate simple HTML email template
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
