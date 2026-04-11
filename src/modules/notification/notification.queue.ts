import { Queue, Job } from "bullmq";
import { getRedisConfig } from "../../services/redis.service";

export interface NotificationJobData {
  userId: string;
  type: string;
  title: string;
  content: string;
  data?: any;
  channels?: {
    inApp?: boolean;
    email?: boolean;
    push?: boolean;
  };
}

export interface EmailJobData {
  userId: string;
  email: string;
  subject: string;
  html: string;
  notificationId: string;
}

export interface InviteEmailJobData {
  to: string;
  subject: string;
  html: string;
  taskTitle: string;
  organizerEmail?: string;
}

const redisConfig = getRedisConfig();

export const notificationQueue = new Queue<
  NotificationJobData | EmailJobData | InviteEmailJobData
>("notification", {
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

export const notificationQueueService = {
  // Add notification job to queue
  add: async (
    data: NotificationJobData,
    options?: { delay?: number; priority?: number },
  ): Promise<Job> => {
    return notificationQueue.add("send-notification", data, {
      ...options,
      jobId: `${data.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    });
  },

  // Add email notification job
  addEmail: async (data: {
    userId: string;
    email: string;
    subject: string;
    html: string;
    notificationId: string;
  }): Promise<Job> => {
    return notificationQueue.add("send-email", data, {
      priority: 2,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    });
  },

  // Add invite email job (no notificationId required)
  addInviteEmail: async (data: InviteEmailJobData): Promise<Job> => {
    return notificationQueue.add("send-invite-email", data, {
      priority: 3,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
    });
  },

  // Get queue status
  getStatus: async () => {
    const [waiting, active, completed, failed] = await Promise.all([
      notificationQueue.getWaitingCount(),
      notificationQueue.getActiveCount(),
      notificationQueue.getCompletedCount(),
      notificationQueue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  },

  // Clean old jobs
  clean: async (gracePeriodMs: number = 24 * 60 * 60 * 1000) => {
    await notificationQueue.clean(gracePeriodMs, 100, "completed");
    await notificationQueue.clean(gracePeriodMs, 100, "failed");
  },

  // Get failed jobs for retry
  getFailedJobs: async (limit: number = 50) => {
    return notificationQueue.getFailed(limit);
  },
};
