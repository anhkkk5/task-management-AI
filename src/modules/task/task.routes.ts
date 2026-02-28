import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import {
  aiBreakdownTask,
  createTask,
  deleteTask,
  getTaskById,
  listTasks,
  listOverdueTasks,
  saveAISchedule,
  updateTask,
} from "./task.controller";

const taskRouter = Router();

taskRouter.post("/", authMiddleware, createTask);

taskRouter.get("/", authMiddleware, listTasks);

taskRouter.get("/overdue", authMiddleware, listOverdueTasks);

taskRouter.get("/:id", authMiddleware, getTaskById);

taskRouter.post("/:id/ai-breakdown", authMiddleware, aiBreakdownTask);

taskRouter.patch("/:id", authMiddleware, updateTask);

taskRouter.delete("/:id", authMiddleware, deleteTask);

taskRouter.post("/save-ai-schedule", authMiddleware, saveAISchedule);

export default taskRouter;
