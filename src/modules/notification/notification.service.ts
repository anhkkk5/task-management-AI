import { Types } from "mongoose";
import { notificationRepository } from "./notification.repository";
import { notificationGateway } from "./notification.gateway";
import { NotificationType, NotificationDoc } from "./notification.model";

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
