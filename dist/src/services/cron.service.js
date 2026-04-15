"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCronJobs = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const task_model_1 = require("../modules/task/task.model");
const initCronJobs = () => {
    // Run daily at 02:00 AM
    node_cron_1.default.schedule("0 2 * * *", async () => {
        console.log("[CronJob] Starting daily task cleanup & archiving...");
        try {
            // 14 days ago date
            const fourteenDaysAgo = new Date();
            fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
            // --- LOGIC 1: HARD DELETE old AI Subtasks ---
            // Condition: AI subtasks (has parent, aiPlanned = true), status completed, older than 14 days
            const deleteResult = await task_model_1.Task.deleteMany({
                parentTaskId: { $exists: true },
                "scheduledTime.aiPlanned": true,
                status: { $in: ["completed", "cancelled"] },
                updatedAt: { $lt: fourteenDaysAgo },
            });
            console.log(`[CronJob] Hard Deleted ${deleteResult.deletedCount} old AI subtasks.`);
            // --- LOGIC 2: SOFT DELETE (ARCHIVE) old Tasks ---
            // Condition: NOT archived, status completed/cancelled, older than 14 days, NOT an AI subtask
            const archiveResult = await task_model_1.Task.updateMany({
                "scheduledTime.aiPlanned": { $ne: true },
                status: { $in: ["completed", "cancelled"] },
                updatedAt: { $lt: fourteenDaysAgo },
                isArchived: { $ne: true },
            }, { $set: { isArchived: true } });
            console.log(`[CronJob] Archived ${archiveResult.modifiedCount} old tasks.`);
        }
        catch (error) {
            console.error("[CronJob] Daily cleanup failed:", error);
        }
    });
    console.log("[CronJob] Scheduled jobs initialized.");
};
exports.initCronJobs = initCronJobs;
