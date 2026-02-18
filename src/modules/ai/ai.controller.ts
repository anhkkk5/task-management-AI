import { Request, Response } from "express";
import { aiService } from "./ai.service";
import { aiStreamingService } from "./ai.streaming.service";

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

    const body = (req as any).body ?? {};
    const message = String(body?.message ?? "").trim();
    if (!message) {
      res.status(400).json({ message: "Message không hợp lệ" });
      return;
    }

    const modelRaw = body?.model;
    const model =
      modelRaw !== undefined && modelRaw !== null
        ? String(modelRaw).trim()
        : undefined;

    const temperatureRaw = body?.temperature;
    const temperature =
      temperatureRaw !== undefined && temperatureRaw !== null
        ? Number(temperatureRaw)
        : undefined;
    if (
      temperature !== undefined &&
      (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)
    ) {
      res.status(400).json({ message: "Temperature không hợp lệ" });
      return;
    }

    const maxTokensRaw = body?.maxTokens;
    const maxTokens =
      maxTokensRaw !== undefined && maxTokensRaw !== null
        ? Number(maxTokensRaw)
        : undefined;
    if (
      maxTokens !== undefined &&
      (!Number.isFinite(maxTokens) || Math.floor(maxTokens) <= 0)
    ) {
      res.status(400).json({ message: "MaxTokens không hợp lệ" });
      return;
    }

    const conversationIdRaw = body?.conversationId;
    const conversationId =
      conversationIdRaw !== undefined && conversationIdRaw !== null
        ? String(conversationIdRaw).trim()
        : undefined;

    const result = await aiService.chat(userId, {
      message,
      conversationId,
      model,
      temperature,
      maxTokens: maxTokens !== undefined ? Math.floor(maxTokens) : undefined,
    });
    res.status(200).json(result);
  } catch (err) {
    const error = err instanceof Error ? err : new Error("UNKNOWN");
    console.error("[AI_CHAT_ERROR]", error);

    const message = error.message;
    if (message === "USER_ID_INVALID") {
      res.status(400).json({ message: "UserId không hợp lệ" });
      return;
    }
    if (message === "CONVERSATION_ID_INVALID") {
      res.status(400).json({ message: "ConversationId không hợp lệ" });
      return;
    }
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

    if (message === "CONVERSATION_FORBIDDEN") {
      res
        .status(403)
        .json({ message: "Không có quyền truy cập conversation này" });
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

export const chatStream = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const body = (req as any).body ?? {};
    const message = String(body?.message ?? "").trim();
    if (!message) {
      res.status(400).json({ message: "Message không hợp lệ" });
      return;
    }

    const modelRaw = body?.model;
    const model =
      modelRaw !== undefined && modelRaw !== null
        ? String(modelRaw).trim()
        : undefined;

    const temperatureRaw = body?.temperature;
    const temperature =
      temperatureRaw !== undefined && temperatureRaw !== null
        ? Number(temperatureRaw)
        : undefined;
    if (
      temperature !== undefined &&
      (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)
    ) {
      res.status(400).json({ message: "Temperature không hợp lệ" });
      return;
    }

    const maxTokensRaw = body?.maxTokens;
    const maxTokens =
      maxTokensRaw !== undefined && maxTokensRaw !== null
        ? Number(maxTokensRaw)
        : undefined;
    if (
      maxTokens !== undefined &&
      (!Number.isFinite(maxTokens) || Math.floor(maxTokens) <= 0)
    ) {
      res.status(400).json({ message: "MaxTokens không hợp lệ" });
      return;
    }

    const conversationIdRaw = body?.conversationId;
    const conversationId =
      conversationIdRaw !== undefined && conversationIdRaw !== null
        ? String(conversationIdRaw).trim()
        : undefined;

    aiStreamingService.initSse(res);

    let closed = false;
    req.on("close", () => {
      closed = true;
    });

    const stream = aiService.chatStream(userId, {
      message,
      conversationId,
      model,
      temperature,
      maxTokens: maxTokens !== undefined ? Math.floor(maxTokens) : undefined,
    });

    for await (const ev of stream) {
      if (closed) {
        return;
      }

      if (ev.type === "meta") {
        aiStreamingService.sendSseEvent(
          res,
          { conversationId: ev.conversationId },
          "meta",
        );
      } else if (ev.type === "delta") {
        aiStreamingService.sendSseEvent(res, { delta: ev.delta }, "chunk");
      } else {
        aiStreamingService.sendSseEvent(
          res,
          { model: ev.model, usage: ev.usage },
          "done",
        );
      }
    }

    if (!closed) {
      aiStreamingService.closeSse(res);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error("UNKNOWN");
    console.error("[AI_CHAT_STREAM_ERROR]", error);

    const message = error.message;

    // If SSE already started, send an error event
    if (res.headersSent) {
      const payload = {
        message:
          message === "CONVERSATION_FORBIDDEN"
            ? "Không có quyền truy cập conversation này"
            : message === "CONVERSATION_ID_INVALID"
              ? "ConversationId không hợp lệ"
              : message === "USER_ID_INVALID"
                ? "UserId không hợp lệ"
                : "Lỗi hệ thống",
        ...(process.env.NODE_ENV !== "production"
          ? { detail: error.message }
          : {}),
      };

      aiStreamingService.sendSseEvent(res, payload, "error");
      aiStreamingService.closeSse(res);
      return;
    }

    if (message === "GROQ_RATE_LIMIT") {
      res
        .status(429)
        .json({ message: "Groq bị giới hạn rate limit. Thử lại sau." });
      return;
    }
    if (message === "USER_ID_INVALID") {
      res.status(400).json({ message: "UserId không hợp lệ" });
      return;
    }
    if (message === "CONVERSATION_ID_INVALID") {
      res.status(400).json({ message: "ConversationId không hợp lệ" });
      return;
    }
    if (message === "CONVERSATION_FORBIDDEN") {
      res
        .status(403)
        .json({ message: "Không có quyền truy cập conversation này" });
      return;
    }
    if (message === "GROQ_UNAUTHORIZED") {
      res.status(500).json({
        message: "Groq bị từ chối (API key không hợp lệ hoặc không có quyền).",
      });
      return;
    }
    if (message === "GROQ_API_KEY_MISSING") {
      res.status(500).json({ message: "Thiếu GROQ_API_KEY trong env" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
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

    const limitRaw = (req as any).query?.limit;
    const limit =
      limitRaw !== undefined && limitRaw !== null
        ? Number(limitRaw)
        : undefined;
    const result = await aiService.listConversations(userId, {
      limit:
        limit !== undefined && Number.isFinite(limit)
          ? Math.floor(limit)
          : undefined,
    });
    res.status(200).json(result);
  } catch (err) {
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

    const limitRaw = (req as any).query?.limit;
    const limit =
      limitRaw !== undefined && limitRaw !== null
        ? Number(limitRaw)
        : undefined;
    const result = await aiService.getConversationById(userId, {
      id,
      limitMessages:
        limit !== undefined && Number.isFinite(limit)
          ? Math.floor(limit)
          : undefined,
    });
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    if (message === "CONVERSATION_ID_INVALID") {
      res.status(400).json({ message: "Conversation id không hợp lệ" });
      return;
    }
    if (message === "CONVERSATION_FORBIDDEN") {
      res
        .status(403)
        .json({ message: "Không có quyền truy cập conversation này" });
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
    if (message === "USER_ID_INVALID") {
      res.status(400).json({ message: "UserId không hợp lệ" });
      return;
    }
    if (message === "AI_JSON_INVALID" || message === "AI_RESPONSE_INVALID") {
      res.status(500).json({
        message: "AI trả về dữ liệu không đúng định dạng. Thử lại sau.",
        ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
      });
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
    if (message === "GROQ_RATE_LIMIT") {
      res.status(429).json({
        message: "Groq bị giới hạn rate limit. Thử lại sau.",
      });
      return;
    }
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
    if (message === "USER_ID_INVALID") {
      res.status(400).json({ message: "UserId không hợp lệ" });
      return;
    }
    if (message === "AI_JSON_INVALID") {
      res.status(500).json({
        message: "AI trả về dữ liệu không đúng định dạng. Thử lại sau.",
        ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
      });
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
    if (message === "GROQ_RATE_LIMIT") {
      res.status(429).json({
        message: "Groq bị giới hạn rate limit. Thử lại sau.",
      });
      return;
    }
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
