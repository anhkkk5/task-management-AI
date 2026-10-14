import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import {
  aiBreakdownTask,
  clearAllScheduledTimes,
  clearScheduledTime,
  createTask,
  deleteTask,
  deleteTasksBatch,
  deleteAllTasks,
  explainTaskEstimation,
  getTaskById,
  listTasks,
  listOverdueTasks,
  saveAISchedule,
  updateTask,
  updateTaskStatus,
  taskCopilotChat,
  copilotChatStream,
  applyCopilotBreakdown,
  extendTaskDeadline,
  reviewTaskExtension,
} from "./task.controller";

const taskRouter = Router();

taskRouter.post("/:id/extend", authMiddleware, extendTaskDeadline);
taskRouter.post("/:id/extension-review", authMiddleware, reviewTaskExtension);

taskRouter.post("/", authMiddleware, createTask);

taskRouter.get("/", authMiddleware, listTasks);

taskRouter.get("/overdue", authMiddleware, listOverdueTasks);

taskRouter.get("/:id", authMiddleware, getTaskById);

taskRouter.post("/:id/ai-breakdown", authMiddleware, aiBreakdownTask);

taskRouter.post("/:id/copilot/chat", authMiddleware, taskCopilotChat);
taskRouter.post("/:id/copilot/stream", authMiddleware, copilotChatStream);
taskRouter.post(
  "/:id/copilot/apply-breakdown",
  authMiddleware,
  applyCopilotBreakdown,
);

taskRouter.get(
  "/:id/explain-estimation",
  authMiddleware,
  explainTaskEstimation,
);

taskRouter.patch("/:id", authMiddleware, updateTask);

// Quick status update endpoint (must be before /:id/... routes)
taskRouter.patch("/:id/status", authMiddleware, updateTaskStatus);

// Batch delete and clear all tasks
taskRouter.post("/batch-delete", authMiddleware, deleteTasksBatch);
taskRouter.delete("/clear-all-tasks", authMiddleware, deleteAllTasks);

taskRouter.delete("/:id", authMiddleware, deleteTask);

taskRouter.post("/save-ai-schedule", authMiddleware, saveAISchedule);

// Clear scheduled time endpoints
taskRouter.delete("/schedule/clear", authMiddleware, clearScheduledTime);
taskRouter.delete(
  "/schedule/clear-all",
  authMiddleware,
  clearAllScheduledTimes,
);

export default taskRouter;
