"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationQueueService = exports.notificationQueue = void 0;
const bullmq_1 = require("bullmq");
const redis_service_1 = require("../../services/redis.service");
const redisConfig = (0, redis_service_1.getRedisConfig)();
exports.notificationQueue = new bullmq_1.Queue("notification", {
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
exports.notificationQueueService = {
    // Add notification job to queue
    add: async (data, options) => {
        return exports.notificationQueue.add("send-notification", data, {
            ...options,
            jobId: `${data.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        });
    },
    // Add email notification job
    addEmail: async (data) => {
        return exports.notificationQueue.add("send-email", data, {
            priority: 2,
            attempts: 5,
            backoff: {
                type: "exponential",
                delay: 5000,
            },
        });
    },
    // Add invite email job (no notificationId required)
    addInviteEmail: async (data) => {
        return exports.notificationQueue.add("send-invite-email", data, {
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
            exports.notificationQueue.getWaitingCount(),
            exports.notificationQueue.getActiveCount(),
            exports.notificationQueue.getCompletedCount(),
            exports.notificationQueue.getFailedCount(),
        ]);
        return { waiting, active, completed, failed };
    },
    // Clean old jobs
    clean: async (gracePeriodMs = 24 * 60 * 60 * 1000) => {
        await exports.notificationQueue.clean(gracePeriodMs, 100, "completed");
        await exports.notificationQueue.clean(gracePeriodMs, 100, "failed");
    },
    // Get failed jobs for retry
    getFailedJobs: async (limit = 50) => {
        return exports.notificationQueue.getFailed(limit);
    },
};
