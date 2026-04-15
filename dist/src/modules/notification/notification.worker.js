"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationWorker = void 0;
const bullmq_1 = require("bullmq");
const redis_service_1 = require("../../services/redis.service");
const notification_service_1 = require("./notification.service");
const notification_repository_1 = require("./notification.repository");
const email_service_1 = require("./email.service");
const redisConfig = (0, redis_service_1.getRedisConfig)();
// Worker xử lý notification jobs
exports.notificationWorker = new bullmq_1.Worker("notification", async (job) => {
    console.log(`[NotificationWorker] Processing job ${job.id} - ${job.name}`);
    switch (job.name) {
        case "send-notification": {
            const { userId, type, title, content, data, channels } = job.data;
            return await notification_service_1.notificationService.create({
                userId,
                type: type,
                title,
                content,
                data,
                channels,
            });
        }
        case "send-email": {
            const { email, subject, html, notificationId, userId } = job.data;
            console.log(`[NotificationWorker] Sending email to: ${email} (userId: ${userId || "N/A"})`);
            console.log(`[NotificationWorker] Subject: ${subject}`);
            console.log(`[NotificationWorker] NotificationId: ${notificationId}`);
            // Send actual email
            const result = await email_service_1.emailService.send({
                to: email,
                subject,
                html,
            });
            if (result.success) {
                // Mark as email sent in DB
                await notification_repository_1.notificationRepository.markEmailSent(notificationId);
                console.log(`[NotificationWorker] Email sent successfully: ${result.messageId}`);
            }
            else {
                console.error(`[NotificationWorker] Failed to send email: ${result.error}`);
                throw new Error(result.error || "Failed to send email");
            }
            return result;
        }
        case "send-invite-email": {
            const { to, subject, html } = job.data;
            console.log(`[NotificationWorker] Sending invite email to: ${to}`);
            console.log(`[NotificationWorker] Subject: ${subject}`);
            const result = await email_service_1.emailService.send({
                to,
                subject,
                html,
            });
            if (result.success) {
                console.log(`[NotificationWorker] Invite email sent successfully: ${result.messageId}`);
            }
            else {
                console.error(`[NotificationWorker] Failed to send invite email: ${result.error}`);
                throw new Error(result.error || "Failed to send invite email");
            }
            return result;
        }
        default:
            throw new Error(`Unknown job type: ${job.name}`);
    }
}, {
    connection: redisConfig,
    concurrency: 5,
});
// Event listeners
exports.notificationWorker.on("completed", (job) => {
    console.log(`[NotificationWorker] Job ${job.id} completed`);
});
exports.notificationWorker.on("failed", (job, err) => {
    console.error(`[NotificationWorker] Job ${job?.id} failed:`, err.message);
});
exports.notificationWorker.on("error", (err) => {
    console.error("[NotificationWorker] Worker error:", err);
});
console.log("[NotificationWorker] Started and listening for jobs");
// Graceful shutdown
process.on("SIGTERM", async () => {
    console.log("[NotificationWorker] SIGTERM received, closing...");
    await exports.notificationWorker.close();
});
process.on("SIGINT", async () => {
    console.log("[NotificationWorker] SIGINT received, closing...");
    await exports.notificationWorker.close();
});
