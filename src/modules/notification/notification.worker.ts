import { Worker, Job } from "bullmq";
import { getRedisConfig } from "../../services/redis.service";
import { notificationService } from "./notification.service";
import { NotificationType } from "./notification.model";
import { notificationRepository } from "./notification.repository";
import { emailService } from "./email.service";

const redisConfig = getRedisConfig();

// Worker xử lý notification jobs
export const notificationWorker = new Worker(
  "notification",
  async (job: Job) => {
    console.log(`[NotificationWorker] Processing job ${job.id} - ${job.name}`);

    switch (job.name) {
      case "send-notification": {
        const { userId, type, title, content, data, channels } = job.data;
        return await notificationService.create({
          userId,
          type: type as NotificationType,
          title,
          content,
          data,
          channels,
        });
      }

      case "send-email": {
        const { email, subject, html, notificationId, userId } = job.data as {
          email: string;
          subject: string;
          html: string;
          notificationId: string;
          userId?: string;
        };

        console.log(
          `[NotificationWorker] Sending email to: ${email} (userId: ${userId || "N/A"})`,
        );
        console.log(`[NotificationWorker] Subject: ${subject}`);
        console.log(`[NotificationWorker] NotificationId: ${notificationId}`);

        // Send actual email
        const result = await emailService.send({
          to: email,
          subject,
          html,
        });

        if (result.success) {
          // Mark as email sent in DB
          await notificationRepository.markEmailSent(notificationId);
          console.log(
            `[NotificationWorker] Email sent successfully: ${result.messageId}`,
          );
        } else {
          console.error(
            `[NotificationWorker] Failed to send email: ${result.error}`,
          );
          throw new Error(result.error || "Failed to send email");
        }

        return result;
      }

      case "send-invite-email": {
        const { to, subject, html } = job.data as {
          to: string;
          subject: string;
          html: string;
          taskTitle: string;
          organizerEmail?: string;
        };

        console.log(`[NotificationWorker] Sending invite email to: ${to}`);
        console.log(`[NotificationWorker] Subject: ${subject}`);

        const result = await emailService.send({
          to,
          subject,
          html,
        });

        if (result.success) {
          console.log(
            `[NotificationWorker] Invite email sent successfully: ${result.messageId}`,
          );
        } else {
          console.error(
            `[NotificationWorker] Failed to send invite email: ${result.error}`,
          );
          throw new Error(result.error || "Failed to send invite email");
        }

        return result;
      }

      default:
        throw new Error(`Unknown job type: ${job.name}`);
    }
  },
  {
    connection: redisConfig,
    concurrency: 5,
  },
);

// Event listeners
notificationWorker.on("completed", (job) => {
  console.log(`[NotificationWorker] Job ${job.id} completed`);
});

notificationWorker.on("failed", (job, err) => {
  console.error(`[NotificationWorker] Job ${job?.id} failed:`, err.message);
});

notificationWorker.on("error", (err) => {
  console.error("[NotificationWorker] Worker error:", err);
});

console.log("[NotificationWorker] Started and listening for jobs");

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[NotificationWorker] SIGTERM received, closing...");
  await notificationWorker.close();
});

process.on("SIGINT", async () => {
  console.log("[NotificationWorker] SIGINT received, closing...");
  await notificationWorker.close();
});
