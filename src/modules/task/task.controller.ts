import { Request, Response } from "express";
import { taskService } from "./task.service";
import { TaskPriority } from "./task.dto";

const parsePriority = (value: unknown): TaskPriority | undefined => {
  if (value === undefined || value === null) return undefined;
  const v = String(value);
  if (v === "low" || v === "medium" || v === "high" || v === "urgent") return v;
  return undefined;
};

export const createTask = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const deadlineRaw =
      _req.body?.deadline !== undefined
        ? String(_req.body.deadline)
        : undefined;
    const deadline = deadlineRaw ? new Date(deadlineRaw) : undefined;
    if (deadlineRaw && Number.isNaN(deadline?.getTime())) {
      res.status(400).json({ message: "Deadline không hợp lệ" });
      return;
    }

    const reminderAtRaw =
      _req.body?.reminderAt !== undefined
        ? String(_req.body.reminderAt)
        : undefined;
    const reminderAt = reminderAtRaw ? new Date(reminderAtRaw) : undefined;
    if (reminderAtRaw && Number.isNaN(reminderAt?.getTime())) {
      res.status(400).json({ message: "ReminderAt không hợp lệ" });
      return;
    }

    const tags = Array.isArray(_req.body?.tags)
      ? (_req.body.tags as unknown[]).map((x) => String(x))
      : undefined;

    const task = await taskService.create(userId, {
      title: String(_req.body?.title ?? ""),
      description:
        _req.body?.description !== undefined
          ? String(_req.body.description)
          : undefined,
      deadline,
      priority: parsePriority(_req.body?.priority),
      tags,
      reminderAt,
    });

    res.status(201).json({ task });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "INVALID_TITLE") {
      res.status(400).json({ message: "Title không hợp lệ" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getTaskById = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const task = await taskService.getById(String(_req.params.id));
    res.status(200).json({ task });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "TASK_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy task" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const listTasks = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};

export const updateTask = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};

export const deleteTask = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};
