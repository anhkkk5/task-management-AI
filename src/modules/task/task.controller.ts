import { Request, Response } from "express";
import { taskService } from "./task.service";
import { TaskPriority, TaskStatus } from "./task.dto";
import searchHelper from "../../common/utils/search-helper";
import paginationHelper from "../../common/utils/pagination-helper";

const parsePriority = (value: unknown): TaskPriority | undefined => {
  if (value === undefined || value === null) return undefined;
  const v = String(value);
  if (v === "low" || v === "medium" || v === "high" || v === "urgent") return v;
  return undefined;
};

export const aiBreakdownTask = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const taskId = String(_req.params.id ?? "").trim();
    if (!taskId) {
      res.status(400).json({ message: "Task id không hợp lệ" });
      return;
    }

    const task = await taskService.aiBreakdown(userId, taskId);
    res.status(200).json({ task });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message === "TASK_FORBIDDEN") {
      res.status(403).json({ message: "Không có quyền truy cập task này" });
      return;
    }
    if (message === "AI_JSON_INVALID" || message === "AI_RESPONSE_INVALID") {
      res.status(500).json({
        message: "AI trả về dữ liệu không đúng định dạng. Thử lại sau.",
        ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
      });
      return;
    }
    if (message === "GROQ_RATE_LIMIT") {
      res
        .status(429)
        .json({ message: "Groq bị giới hạn rate limit. Thử lại sau." });
      return;
    }
    if (message === "GROQ_API_KEY_MISSING") {
      res.status(500).json({ message: "Thiếu GROQ_API_KEY trong env" });
      return;
    }
    if (message === "GROQ_UNAUTHORIZED") {
      res.status(500).json({
        message: "Groq bị từ chối (API key không hợp lệ hoặc không có quyền).",
      });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
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

const parseScheduledTime = (
  value: unknown,
):
  | {
      start: Date;
      end: Date;
      aiPlanned?: boolean;
      reason?: string;
    }
  | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") return undefined;
  const obj = value as any;

  const startRaw = obj?.start !== undefined ? String(obj.start) : undefined;
  const endRaw = obj?.end !== undefined ? String(obj.end) : undefined;
  if (!startRaw || !endRaw) return undefined;

  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return undefined;
  if (end.getTime() <= start.getTime()) return undefined;

  return {
    start,
    end,
    aiPlanned:
      obj?.aiPlanned !== undefined ? Boolean(obj.aiPlanned) : undefined,
    reason: obj?.reason !== undefined ? String(obj.reason) : undefined,
  };
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

    const scheduledTime =
      _req.body?.scheduledTime !== undefined
        ? parseScheduledTime(_req.body.scheduledTime)
        : undefined;
    if (_req.body?.scheduledTime !== undefined && scheduledTime === undefined) {
      res.status(400).json({ message: "ScheduledTime không hợp lệ" });
      return;
    }

    const estimatedDurationRaw =
      _req.body?.estimatedDuration !== undefined
        ? Number(_req.body.estimatedDuration)
        : undefined;
    const estimatedDuration =
      estimatedDurationRaw !== undefined &&
      Number.isFinite(estimatedDurationRaw)
        ? Math.max(0, Math.floor(estimatedDurationRaw))
        : undefined;
    if (
      _req.body?.estimatedDuration !== undefined &&
      estimatedDurationRaw !== undefined &&
      !Number.isFinite(estimatedDurationRaw)
    ) {
      res.status(400).json({ message: "EstimatedDuration không hợp lệ" });
      return;
    }

    const parentTaskIdRaw =
      _req.body?.parentTaskId !== undefined
        ? String(_req.body.parentTaskId)
        : undefined;
    const parentTaskId = parentTaskIdRaw ? parentTaskIdRaw.trim() : undefined;

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
      estimatedDuration,
      parentTaskId,
      scheduledTime,
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
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const task = await taskService.getById(userId, String(_req.params.id));
    res.status(200).json({ task });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "TASK_FORBIDDEN") {
      res.status(403).json({ message: "Không có quyền truy cập task này" });
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
    console.log("listTasks - userId from token:", userId);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const status = parseStatus((_req.query as any)?.status);
    const priority = parsePriority((_req.query as any)?.priority);
    const deadlineQuery = (_req.query as any)?.deadline;

    const search = searchHelper(_req.query as any);

    const initialPagination = paginationHelper(
      {
        currentPage: 1,
        limitItem: 20,
      },
      _req.query as any,
      0,
    );

    const page = initialPagination.currentPage;
    const limit = Math.min(initialPagination.limitItem, 100);

    const deadlineFromTo =
      deadlineQuery && String(deadlineQuery) === "today"
        ? getTodayRange()
        : null;

    const result = await taskService.list(userId, {
      status,
      priority,
      title: search.regex,
      keyword: search.keyword,
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

    const scheduledTime =
      _req.body?.scheduledTime !== undefined
        ? parseScheduledTime(_req.body.scheduledTime)
        : undefined;
    if (_req.body?.scheduledTime !== undefined && scheduledTime === undefined) {
      res.status(400).json({ message: "ScheduledTime không hợp lệ" });
      return;
    }

    const estimatedDurationRaw =
      _req.body?.estimatedDuration !== undefined
        ? Number(_req.body.estimatedDuration)
        : undefined;
    const estimatedDuration =
      estimatedDurationRaw !== undefined &&
      Number.isFinite(estimatedDurationRaw)
        ? Math.max(0, Math.floor(estimatedDurationRaw))
        : undefined;
    if (
      _req.body?.estimatedDuration !== undefined &&
      estimatedDurationRaw !== undefined &&
      !Number.isFinite(estimatedDurationRaw)
    ) {
      res.status(400).json({ message: "EstimatedDuration không hợp lệ" });
      return;
    }

    const parentTaskIdRaw =
      _req.body?.parentTaskId !== undefined
        ? String(_req.body.parentTaskId)
        : undefined;
    const parentTaskId = parentTaskIdRaw ? parentTaskIdRaw.trim() : undefined;

    let aiBreakdown:
      | {
          title: string;
          status?: TaskStatus;
          estimatedDuration?: number;
        }[]
      | undefined;
    if (_req.body?.aiBreakdown !== undefined) {
      if (!Array.isArray(_req.body.aiBreakdown)) {
        res.status(400).json({ message: "AiBreakdown không hợp lệ" });
        return;
      }

      aiBreakdown = [];
      for (const x of _req.body.aiBreakdown as any[]) {
        const title = String(x?.title ?? "");

        const statusRaw = x?.status;
        const status =
          statusRaw !== undefined ? parseStatus(statusRaw) : undefined;
        if (statusRaw !== undefined && status === undefined) {
          res
            .status(400)
            .json({ message: "AiBreakdown có status không hợp lệ" });
          return;
        }

        const estRaw =
          x?.estimatedDuration !== undefined
            ? Number(x.estimatedDuration)
            : undefined;
        const estimatedDuration =
          estRaw !== undefined && Number.isFinite(estRaw)
            ? Math.max(0, Math.floor(estRaw))
            : undefined;
        if (
          x?.estimatedDuration !== undefined &&
          (estRaw === undefined || !Number.isFinite(estRaw))
        ) {
          res
            .status(400)
            .json({ message: "AiBreakdown có estimatedDuration không hợp lệ" });
          return;
        }

        aiBreakdown.push({
          title,
          status,
          estimatedDuration,
        });
      }
    }

    const task = await taskService.update(userId, String(_req.params.id), {
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
      scheduledTime: scheduledTime
        ? {
            start: scheduledTime.start,
            end: scheduledTime.end,
            aiPlanned: scheduledTime.aiPlanned ?? false,
            reason: scheduledTime.reason,
          }
        : undefined,
      estimatedDuration,
      parentTaskId,
      aiBreakdown,
    });

    res.status(200).json({ task });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "INVALID_TITLE") {
      res.status(400).json({ message: "Title không hợp lệ" });
      return;
    }

    if (message === "TASK_FORBIDDEN") {
      res.status(403).json({ message: "Không có quyền cập nhật task này" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const deleteTask = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const result = await taskService.delete(userId, String(_req.params.id));
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "TASK_FORBIDDEN") {
      res.status(403).json({ message: "Không có quyền xóa task này" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const saveAISchedule = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const schedule = _req.body?.schedule;
    if (!Array.isArray(schedule)) {
      res.status(400).json({ message: "Schedule phải là một mảng" });
      return;
    }

    const parseTimeRange = (
      suggestedTime: string,
    ): {
      start: { h: number; m: number };
      end: { h: number; m: number };
    } | null => {
      const match = suggestedTime.match(
        /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
      );
      if (!match) return null;
      const sh = Number(match[1]);
      const sm = Number(match[2]);
      const eh = Number(match[3]);
      const em = Number(match[4]);
      if (![sh, sm, eh, em].every((x) => Number.isFinite(x))) return null;
      return { start: { h: sh, m: sm }, end: { h: eh, m: em } };
    };

    const nowDateStr = new Date().toISOString().split("T")[0];
    const parsedSchedule: {
      sessionId?: string;
      taskId: string;
      title?: string;
      createSubtask?: boolean;
      scheduledTime: {
        start: Date;
        end: Date;
        aiPlanned: boolean;
        reason: string;
      };
    }[] = [];

    for (const dayItem of schedule) {
      const dateStr = String(dayItem?.date ?? nowDateStr);
      const parts = dateStr.split("-").map(Number);
      if (parts.length !== 3 || parts.some((x) => !Number.isFinite(x))) {
        continue;
      }
      const [year, month, day] = parts;

      const tasks = Array.isArray(dayItem?.tasks) ? dayItem.tasks : [];
      for (const t of tasks) {
        const taskId = String(t?.taskId ?? "");
        const suggestedTime = String(t?.suggestedTime ?? "");
        if (!taskId || !suggestedTime) continue;

        const range = parseTimeRange(suggestedTime);
        if (!range) continue;

        const start = new Date(
          year,
          month - 1,
          day,
          range.start.h,
          range.start.m,
        );
        const end = new Date(year, month - 1, day, range.end.h, range.end.m);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          continue;
        }
        if (end.getTime() <= start.getTime()) continue;

        parsedSchedule.push({
          sessionId:
            t?.sessionId !== undefined && t?.sessionId !== null
              ? String(t.sessionId)
              : undefined,
          taskId,
          title: t?.title !== undefined ? String(t.title) : undefined,
          createSubtask:
            t?.createSubtask !== undefined
              ? Boolean(t.createSubtask)
              : undefined,
          scheduledTime: {
            start,
            end,
            aiPlanned: true,
            reason: String(t?.reason || "AI sắp xếp"),
          },
        });
      }
    }

    const result = await taskService.saveAISchedule(userId, parsedSchedule);
    res.status(200).json({
      message: `Đã tạo ${result.created} phiên và cập nhật ${result.updated} công việc`,
      created: result.created,
      updated: result.updated,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "USER_ID_INVALID") {
      res.status(400).json({ message: "User ID không hợp lệ" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
