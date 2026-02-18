import { Request, Response } from "express";
import { aiService } from "./ai.service";

const getUserId = (req: Request): string | null => {
  const userId = (req as any).user?.userId;
  return userId ? String(userId) : null;
};

export const chat = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const message = String((req as any).body?.message ?? "").trim();
    if (!message) {
      res.status(400).json({ message: "Message không hợp lệ" });
      return;
    }

    const result = await aiService.chat(userId, { message });
    res.status(200).json(result);
  } catch (err) {
    const error = err instanceof Error ? err : new Error("UNKNOWN");
    console.error("[AI_CHAT_ERROR]", error);

    const message = error.message;
    if (message === "NOT_IMPLEMENTED") {
      res.status(501).json({ message: "Chức năng chưa triển khai" });
      return;
    }
    if (message === "GROQ_API_KEY_MISSING") {
      res.status(500).json({
        message: "Thiếu GROQ_API_KEY trong env",
        ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
      });
      return;
    }

    if (message === "GROQ_UNAUTHORIZED") {
      res.status(500).json({
        message: "Groq bị từ chối (API key không hợp lệ hoặc không có quyền).",
        ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
      });
      return;
    }

    if (message === "GROQ_RATE_LIMIT") {
      res.status(429).json({
        message: "Groq bị giới hạn rate limit. Thử lại sau.",
        ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
      });
      return;
    }

    const lower = message.toLowerCase();
    if (
      lower.includes("permission") ||
      lower.includes("unauthorized") ||
      lower.includes("403")
    ) {
      res.status(500).json({
        message:
          "Provider AI bị từ chối (permission/quota/billing). Kiểm tra API key và quyền truy cập.",
        ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
      });
      return;
    }
    if (
      lower.includes("quota") ||
      lower.includes("rate") ||
      lower.includes("429")
    ) {
      res.status(429).json({
        message: "Provider AI bị giới hạn quota/rate limit. Thử lại sau.",
        ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
      });
      return;
    }
    if (
      lower.includes("model") &&
      (lower.includes("not found") || lower.includes("invalid"))
    ) {
      res.status(500).json({
        message: "AI model không hợp lệ. Kiểm tra cấu hình model.",
        ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
      });
      return;
    }

    res.status(500).json({
      message: "Lỗi hệ thống",
      ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
    });
  }
};

export const listConversations = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const result = await aiService.listConversations(userId);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message === "NOT_IMPLEMENTED") {
      res.status(501).json({ message: "Chức năng chưa triển khai" });
      return;
    }
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getConversationById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const id = String((req as any).params?.id ?? "").trim();
    if (!id) {
      res.status(400).json({ message: "Conversation id không hợp lệ" });
      return;
    }

    const result = await aiService.getConversationById(userId, { id });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message === "NOT_IMPLEMENTED") {
      res.status(501).json({ message: "Chức năng chưa triển khai" });
      return;
    }
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const taskBreakdown = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const title = String((req as any).body?.title ?? "").trim();
    const deadlineRaw = (req as any).body?.deadline;
    const deadline = deadlineRaw ? new Date(String(deadlineRaw)) : undefined;

    if (!title) {
      res.status(400).json({ message: "Title không hợp lệ" });
      return;
    }
    if (deadlineRaw && Number.isNaN(deadline?.getTime())) {
      res.status(400).json({ message: "Deadline không hợp lệ" });
      return;
    }

    const result = await aiService.taskBreakdown(userId, { title, deadline });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message === "NOT_IMPLEMENTED") {
      res.status(501).json({ message: "Chức năng chưa triển khai" });
      return;
    }
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const prioritySuggest = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const title = String((req as any).body?.title ?? "").trim();
    const deadlineRaw = (req as any).body?.deadline;
    const deadline = deadlineRaw ? new Date(String(deadlineRaw)) : undefined;

    if (!title) {
      res.status(400).json({ message: "Title không hợp lệ" });
      return;
    }
    if (deadlineRaw && Number.isNaN(deadline?.getTime())) {
      res.status(400).json({ message: "Deadline không hợp lệ" });
      return;
    }

    const result = await aiService.prioritySuggest(userId, { title, deadline });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message === "NOT_IMPLEMENTED") {
      res.status(501).json({ message: "Chức năng chưa triển khai" });
      return;
    }
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const schedulePlan = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const goal = String((req as any).body?.goal ?? "").trim();
    const daysRaw = (req as any).body?.days;
    const days = daysRaw !== undefined ? Number(daysRaw) : undefined;

    if (!goal) {
      res.status(400).json({ message: "Goal không hợp lệ" });
      return;
    }
    if (days !== undefined && (!Number.isFinite(days) || days <= 0)) {
      res.status(400).json({ message: "Days không hợp lệ" });
      return;
    }

    const result = await aiService.schedulePlan(userId, { goal, days });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message === "NOT_IMPLEMENTED") {
      res.status(501).json({ message: "Chức năng chưa triển khai" });
      return;
    }
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
