import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import {
  createTask,
  deleteTask,
  getTaskById,
  listTasks,
  updateTask,
} from "./task.controller";

const taskRouter = Router();

taskRouter.post("/", authMiddleware, createTask);

taskRouter.get("/", authMiddleware, listTasks);

taskRouter.get("/:id", authMiddleware, getTaskById);

taskRouter.patch("/:id", authMiddleware, updateTask);

taskRouter.delete("/:id", authMiddleware, deleteTask);

export default taskRouter;
