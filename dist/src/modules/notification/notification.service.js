"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationService = void 0;
const mongoose_1 = require("mongoose");
const notification_repository_1 = require("./notification.repository");
const notification_gateway_1 = require("./notification.gateway");
const notification_queue_1 = require("./notification.queue");
const toPublicNotification = (doc) => {
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
exports.notificationService = {
    // Create and emit notification
    create: async (data) => {
        const notification = await notification_repository_1.notificationRepository.create({
            userId: new mongoose_1.Types.ObjectId(data.userId),
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
            notification_gateway_1.notificationGateway.emitToUser(data.userId, publicNotification);
        }
        // Queue email job if email channel enabled
        if (publicNotification.channels.email) {
            try {
                await notification_queue_1.notificationQueue.add("send-email", {
                    userId: data.userId,
                    email: data.data?.userEmail || "user@example.com", // TODO: Get from user service
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
    // List notifications for user
    list: async (userId, options = {}) => {
        const notifications = await notification_repository_1.notificationRepository.listForUser(new mongoose_1.Types.ObjectId(userId), options);
        return notifications.map(toPublicNotification);
    },
    // Count unread notifications
    countUnread: async (userId) => {
        return notification_repository_1.notificationRepository.countUnread(new mongoose_1.Types.ObjectId(userId));
    },
    // Mark as read
    markAsRead: async (notificationId, userId) => {
        const updated = await notification_repository_1.notificationRepository.markAsRead(notificationId, new mongoose_1.Types.ObjectId(userId));
        if (!updated)
            return null;
        const publicNotification = toPublicNotification(updated);
        // Emit read update realtime
        notification_gateway_1.notificationGateway.emitReadUpdate(userId, {
            notificationId: String(notificationId),
            isRead: true,
        });
        return publicNotification;
    },
    // Mark all as read
    markAllAsRead: async (userId) => {
        await notification_repository_1.notificationRepository.markAllAsRead(new mongoose_1.Types.ObjectId(userId));
    },
    // Delete notification
    delete: async (notificationId, userId) => {
        return notification_repository_1.notificationRepository.delete(notificationId, new mongoose_1.Types.ObjectId(userId));
    },
};
// Generate simple HTML email template
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
