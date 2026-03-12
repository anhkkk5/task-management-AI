"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const task_controller_1 = require("./task.controller");
const taskRouter = (0, express_1.Router)();
taskRouter.post("/", auth_middleware_1.authMiddleware, task_controller_1.createTask);
taskRouter.get("/", auth_middleware_1.authMiddleware, task_controller_1.listTasks);
taskRouter.get("/overdue", auth_middleware_1.authMiddleware, task_controller_1.listOverdueTasks);
taskRouter.get("/:id", auth_middleware_1.authMiddleware, task_controller_1.getTaskById);
taskRouter.post("/:id/ai-breakdown", auth_middleware_1.authMiddleware, task_controller_1.aiBreakdownTask);
taskRouter.patch("/:id", auth_middleware_1.authMiddleware, task_controller_1.updateTask);
// Quick status update endpoint (must be before /:id/... routes)
taskRouter.patch("/:id/status", auth_middleware_1.authMiddleware, task_controller_1.updateTaskStatus);
taskRouter.delete("/:id", auth_middleware_1.authMiddleware, task_controller_1.deleteTask);
taskRouter.post("/save-ai-schedule", auth_middleware_1.authMiddleware, task_controller_1.saveAISchedule);
exports.default = taskRouter;
