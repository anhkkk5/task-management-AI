import { Request, Response } from "express";
import { taskService } from "./task.service";
import { TaskPriority, TaskStatus } from "./task.dto";

const parsePriority = (value: unknown): TaskPriority | undefined => {
  if (value === undefined || value === null) return undefined;
  const v = String(value);
  if (v === "low" || v === "medium" || v === "high" || v === "urgent") return v;
  return undefined;
};

const parseStatus = (value: unknown): TaskStatus | undefined => {
  if (value === undefined || value === null) return undefined;
  const v = String(value);
  if (
    v === "todo" ||
    v === "in_progress" ||
    v === "completed" ||
    v === "cancelled"
  )
    return v;
  return undefined;
};

const parsePositiveInt = (value: unknown, defaultValue: number): number => {
  if (value === undefined || value === null) return defaultValue;
  const n = Number(value);
  if (!Number.isFinite(n)) return defaultValue;
  const x = Math.floor(n);
  if (x <= 0) return defaultValue;
  return x;
};

const getTodayRange = (): { from: Date; to: Date } => {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from, to };
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
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const status = parseStatus((_req.query as any)?.status);
    const priority = parsePriority((_req.query as any)?.priority);
    const deadlineQuery = (_req.query as any)?.deadline;

    const page = parsePositiveInt((_req.query as any)?.page, 1);
    const limitRaw = parsePositiveInt((_req.query as any)?.limit, 20);
    const limit = Math.min(limitRaw, 100);

    const deadlineFromTo =
      deadlineQuery && String(deadlineQuery) === "today"
        ? getTodayRange()
        : null;

    const result = await taskService.list(userId, {
      status,
      priority,
      deadlineFrom: deadlineFromTo?.from,
      deadlineTo: deadlineFromTo?.to,
      page,
      limit,
    });

    res.status(200).json(result);
  } catch (_err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const listOverdueTasks = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const page = parsePositiveInt((_req.query as any)?.page, 1);
    const limitRaw = parsePositiveInt((_req.query as any)?.limit, 20);
    const limit = Math.min(limitRaw, 100);

    const result = await taskService.overdue(userId, { page, limit });
    res.status(200).json(result);
  } catch (_err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateTask = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const statusRaw = _req.body?.status;
    const status = parseStatus(statusRaw);
    if (statusRaw !== undefined && status === undefined) {
      res.status(400).json({ message: "Status không hợp lệ" });
      return;
    }

    const priorityRaw = _req.body?.priority;
    const priority = parsePriority(priorityRaw);
    if (priorityRaw !== undefined && priority === undefined) {
      res.status(400).json({ message: "Priority không hợp lệ" });
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

    const tags =
      _req.body?.tags !== undefined
        ? Array.isArray(_req.body?.tags)
          ? (_req.body.tags as unknown[]).map((x) => String(x))
          : undefined
        : undefined;
    if (_req.body?.tags !== undefined && tags === undefined) {
      res.status(400).json({ message: "Tags không hợp lệ" });
      return;
    }

    const task = await taskService.update(String(_req.params.id), {
      title:
        _req.body?.title !== undefined ? String(_req.body.title) : undefined,
      description:
        _req.body?.description !== undefined
          ? String(_req.body.description)
          : undefined,
      status,
      priority,
      deadline,
      tags,
      reminderAt,
    });

    res.status(200).json({ task });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "INVALID_TITLE") {
      res.status(400).json({ message: "Title không hợp lệ" });
      return;
    }
    if (message === "TASK_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy task" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const deleteTask = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};
