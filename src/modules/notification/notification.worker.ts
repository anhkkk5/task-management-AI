import { Worker, Job } from "bullmq";
import { getRedisConfig } from "../../services/redis.service";
import { notificationService } from "./notification.service";
import { NotificationType } from "./notification.model";
import { notificationRepository } from "./notification.repository";

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
        // Sẽ được triển khai trong Commit 6
        const { email, notificationId } = job.data as {
          email: string;
          notificationId: string;
        };
        console.log(`[NotificationWorker] Email job queued for ${email}`);
        // Mark as email sent in DB
        await notificationRepository.markEmailSent(notificationId);
        return { success: true, message: "Email queued for sending" };
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
