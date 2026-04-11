import cron from "node-cron";
import { Task } from "../modules/task/task.model";

export const initCronJobs = () => {
  // Run daily at 02:00 AM
  cron.schedule("0 2 * * *", async () => {
    console.log("[CronJob] Starting daily task cleanup & archiving...");
    try {
      // 14 days ago date
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      // --- LOGIC 1: HARD DELETE old AI Subtasks ---
      // Condition: AI subtasks (has parent, aiPlanned = true), status completed, older than 14 days
      const deleteResult = await Task.deleteMany({
        parentTaskId: { $exists: true },
        "scheduledTime.aiPlanned": true,
        status: { $in: ["completed", "cancelled"] },
        updatedAt: { $lt: fourteenDaysAgo },
      });
      console.log(
        `[CronJob] Hard Deleted ${deleteResult.deletedCount} old AI subtasks.`,
      );

      // --- LOGIC 2: SOFT DELETE (ARCHIVE) old Tasks ---
      // Condition: NOT archived, status completed/cancelled, older than 14 days, NOT an AI subtask
      const archiveResult = await Task.updateMany(
        {
          "scheduledTime.aiPlanned": { $ne: true },
          status: { $in: ["completed", "cancelled"] },
          updatedAt: { $lt: fourteenDaysAgo },
          isArchived: { $ne: true },
        },
        { $set: { isArchived: true } },
      );
      console.log(
        `[CronJob] Archived ${archiveResult.modifiedCount} old tasks.`,
      );
    } catch (error) {
      console.error("[CronJob] Daily cleanup failed:", error);
    }
  });

  console.log("[CronJob] Scheduled jobs initialized.");
};
