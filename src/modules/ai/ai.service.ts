import { Types } from "mongoose";
import { aiProvider, AiChatStreamEvent } from "./ai.provider";
import { aiRepository } from "./ai.repository";
import {
  PublicAiConversation,
  PublicAiMessage,
  toPublicConversation,
  toPublicMessage,
} from "./ai.mapper";
import { aiCacheService } from "./ai.cache.service";

export const aiService = {
  chat: async (
    userId: string,
    input: {
      message: string;
      conversationId?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<{
    reply: string;
    conversationId: string;
    model?: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }
    const userObjectId = new Types.ObjectId(userId);
    const title = input.message.slice(0, 60);

    if (input.conversationId && !Types.ObjectId.isValid(input.conversationId)) {
      throw new Error("CONVERSATION_ID_INVALID");
    }
    const conversationObjectId = input.conversationId
      ? new Types.ObjectId(input.conversationId)
      : (
          await aiRepository.createConversation({
            userId: userObjectId,
            title,
          })
        )._id;

    // ensure ownership if conversationId is provided
    if (input.conversationId) {
      const existing = await aiRepository.findConversationByIdForUser({
        conversationId: conversationObjectId,
        userId: userObjectId,
      });
      if (!existing) {
        throw new Error("CONVERSATION_FORBIDDEN");
      }
    }

    await aiRepository.createMessage({
      conversationId: conversationObjectId,
      userId: userObjectId,
      role: "user",
      content: input.message,
    });

    const result = await aiProvider.chat({
      messages: [
        {
          role: "system",
          content: "You are a productivity assistant. Reply in Vietnamese.",
        },
        {
          role: "user",
          content: input.message,
        },
      ],
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    });

    await aiRepository.createMessage({
      conversationId: conversationObjectId,
      userId: userObjectId,
      role: "assistant",
      content: result.content,
      tokens: result.usage?.totalTokens,
    });
    await aiRepository.touchConversationUpdatedAt({
      conversationId: conversationObjectId,
      userId: userObjectId,
    });

    return {
      reply: result.content,
      conversationId: String(conversationObjectId),
      model: result.model,
      usage: result.usage,
    };
  },

  chatStream: async function* (
    userId: string,
    input: {
      message: string;
      conversationId?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): AsyncGenerator<AiChatStreamEvent> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }
    const userObjectId = new Types.ObjectId(userId);
    const title = input.message.slice(0, 60);

    if (input.conversationId && !Types.ObjectId.isValid(input.conversationId)) {
      throw new Error("CONVERSATION_ID_INVALID");
    }
    const conversationObjectId = input.conversationId
      ? new Types.ObjectId(input.conversationId)
      : (
          await aiRepository.createConversation({
            userId: userObjectId,
            title,
          })
        )._id;

    if (input.conversationId) {
      const existing = await aiRepository.findConversationByIdForUser({
        conversationId: conversationObjectId,
        userId: userObjectId,
      });
      if (!existing) {
        throw new Error("CONVERSATION_FORBIDDEN");
      }
    }

    await aiRepository.createMessage({
      conversationId: conversationObjectId,
      userId: userObjectId,
      role: "user",
      content: input.message,
    });

    // First event: provide conversationId so client can persist it
    yield { type: "meta", conversationId: String(conversationObjectId) };

    const stream = aiProvider.chatStream({
      messages: [
        {
          role: "system",
          content: "You are a productivity assistant. Reply in Vietnamese.",
        },
        {
          role: "user",
          content: input.message,
        },
      ],
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    });

    let assistantText = "";
    let finalModel: string | undefined;
    let finalUsage:
      | {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
        }
      | undefined;

    for await (const ev of stream) {
      if (ev.type === "meta") {
        yield ev;
        continue;
      }

      if (ev.type === "delta") {
        assistantText += ev.delta;
        yield ev;
        continue;
      }

      finalModel = ev.model;
      finalUsage = ev.usage;
      yield ev;
    }

    if (assistantText) {
      await aiRepository.createMessage({
        conversationId: conversationObjectId,
        userId: userObjectId,
        role: "assistant",
        content: assistantText,
        tokens: finalUsage?.totalTokens,
      });
    }
    await aiRepository.touchConversationUpdatedAt({
      conversationId: conversationObjectId,
      userId: userObjectId,
    });
  },

  listConversations: async (
    userId: string,
    input?: { limit?: number },
  ): Promise<{ conversations: PublicAiConversation[] }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }
    const userObjectId = new Types.ObjectId(userId);
    const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);
    const items = await aiRepository.listConversationsByUser({
      userId: userObjectId,
      limit,
    });
    return { conversations: items.map(toPublicConversation) };
  },

  getConversationById: async (
    userId: string,
    input: { id: string; limitMessages?: number },
  ): Promise<{
    conversation: PublicAiConversation;
    messages: PublicAiMessage[];
  }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }
    if (!Types.ObjectId.isValid(input.id)) {
      throw new Error("CONVERSATION_ID_INVALID");
    }
    const userObjectId = new Types.ObjectId(userId);
    const conversationObjectId = new Types.ObjectId(input.id);

    const conversation = await aiRepository.findConversationByIdForUser({
      conversationId: conversationObjectId,
      userId: userObjectId,
    });
    if (!conversation) {
      throw new Error("CONVERSATION_FORBIDDEN");
    }

    const limit = Math.min(Math.max(input.limitMessages ?? 100, 1), 500);
    const messages = await aiRepository.listMessagesByConversation({
      conversationId: conversationObjectId,
      userId: userObjectId,
      limit,
    });

    return {
      conversation: toPublicConversation(conversation),
      messages: messages.map(toPublicMessage),
    };
  },

  taskBreakdown: async (
    userId: string,
    input: { title: string; deadline?: Date },
  ): Promise<{ steps: { title: string; status: string }[] }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    // Check cache first
    const cached = await aiCacheService.getTaskBreakdown({
      userId,
      title: input.title,
      deadline: input.deadline,
    });
    if (cached) {
      return cached;
    }

    const deadlineText = input.deadline
      ? `Hạn chót: ${input.deadline.toISOString()}`
      : "";

    const prompt = `Hãy breakdown công việc sau thành các bước nhỏ, rõ ràng, có thể thực thi.\nCông việc: ${input.title}\n${deadlineText}\n\nYêu cầu bắt buộc:\n- Trả về DUY NHẤT JSON hợp lệ (không markdown, không giải thích).\n- Format: { "steps": [ { "title": string, "status": "todo" } ] }\n- status luôn là "todo".`;

    const result = await aiProvider.chat({
      messages: [
        {
          role: "system",
          content:
            "You are a productivity assistant. Reply in Vietnamese. Always output valid JSON when asked.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      maxTokens: 600,
    });

    const raw = (result.content || "").trim();

    const extractJson = (text: string): string => {
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return text;
      }
      return text.slice(firstBrace, lastBrace + 1);
    };

    let parsed: any;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      throw new Error("AI_JSON_INVALID");
    }

    const steps = Array.isArray(parsed?.steps) ? parsed.steps : null;
    if (!steps) {
      throw new Error("AI_RESPONSE_INVALID");
    }

    const normalized = steps
      .map((s: any) => ({
        title: String(s?.title ?? "").trim(),
        status: String(s?.status ?? "todo").trim() || "todo",
      }))
      .filter((s: any) => s.title);

    if (!normalized.length) {
      throw new Error("AI_RESPONSE_INVALID");
    }

    const response = {
      steps: normalized.map((s: any) => ({
        title: s.title,
        status:
          s.status === "todo" ||
          s.status === "in_progress" ||
          s.status === "completed" ||
          s.status === "cancelled"
            ? s.status
            : "todo",
      })),
    };

    // Save to cache
    await aiCacheService.setTaskBreakdown(
      { userId, title: input.title, deadline: input.deadline },
      response,
    );

    return response;
  },

  prioritySuggest: async (
    userId: string,
    input: { title: string; deadline?: Date },
  ): Promise<{ priority: string; reason?: string }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    // Check cache first
    const cached = await aiCacheService.getPrioritySuggest({
      userId,
      title: input.title,
      deadline: input.deadline,
    });
    if (cached) {
      return cached;
    }

    const deadlineText = input.deadline
      ? `Hạn chót: ${input.deadline.toISOString()}`
      : "";

    const prompt = `Hãy đề xuất mức độ ưu tiên cho công việc sau, dựa trên mức độ khẩn cấp và tác động.\nCông việc: ${input.title}\n${deadlineText}\n\nYêu cầu bắt buộc:\n- Trả về DUY NHẤT JSON hợp lệ (không markdown, không giải thích).\n- Format: { "priority": "low"|"medium"|"high"|"urgent", "reason": string }`;

    const result = await aiProvider.chat({
      messages: [
        {
          role: "system",
          content:
            "You are a productivity assistant. Reply in Vietnamese. Always output valid JSON when asked.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
      maxTokens: 300,
    });

    const raw = (result.content || "").trim();

    const extractJson = (text: string): string => {
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        return text;
      }
      return text.slice(firstBrace, lastBrace + 1);
    };

    let parsed: any;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch {
      throw new Error("AI_JSON_INVALID");
    }

    const priorityRaw = String(parsed?.priority ?? "").trim();
    const reason =
      parsed?.reason !== undefined && parsed?.reason !== null
        ? String(parsed.reason).trim()
        : undefined;

    const normalizedPriority =
      priorityRaw === "low" ||
      priorityRaw === "medium" ||
      priorityRaw === "high" ||
      priorityRaw === "urgent"
        ? priorityRaw
        : "medium";

    const response = { priority: normalizedPriority, reason };

    // Save to cache
    await aiCacheService.setPrioritySuggest(
      { userId, title: input.title, deadline: input.deadline },
      response,
    );

    return response;
  },

  schedulePlan: async (
    _userId: string,
    _input: { goal: string; days?: number },
  ): Promise<{ plan: string }> => {
    throw new Error("NOT_IMPLEMENTED");
  },
};
