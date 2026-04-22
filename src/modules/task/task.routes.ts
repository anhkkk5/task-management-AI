import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import {
  aiBreakdownTask,
  clearAllScheduledTimes,
  clearScheduledTime,
  createTask,
  deleteTask,
  explainTaskEstimation,
  getTaskById,
  listTasks,
  listOverdueTasks,
  saveAISchedule,
  updateTask,
  updateTaskStatus,
} from "./task.controller";

const taskRouter = Router();

taskRouter.post("/", authMiddleware, createTask);

taskRouter.get("/", authMiddleware, listTasks);

taskRouter.get("/overdue", authMiddleware, listOverdueTasks);

taskRouter.get("/:id", authMiddleware, getTaskById);

taskRouter.post("/:id/ai-breakdown", authMiddleware, aiBreakdownTask);

taskRouter.get(
  "/:id/explain-estimation",
  authMiddleware,
  explainTaskEstimation,
);

taskRouter.patch("/:id", authMiddleware, updateTask);

// Quick status update endpoint (must be before /:id/... routes)
taskRouter.patch("/:id/status", authMiddleware, updateTaskStatus);

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
