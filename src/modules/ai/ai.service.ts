import { Types } from "mongoose";
import { aiProvider } from "./ai.provider";
import { aiRepository } from "./ai.repository";
import {
  PublicAiConversation,
  PublicAiMessage,
  toPublicConversation,
  toPublicMessage,
} from "./ai.mapper";
import { aiCacheService } from "./ai.cache.service";
import { extractJson } from "./ai-utils";

// Re-export từ các service đã tách
export { aiChatService } from "./ai-chat.service";
export { aiScheduleService } from "./ai-schedule.service";
export { aiRescheduleService } from "./ai-reschedule.service";

// Các functions còn lại trong ai.service.ts
export const aiService = {
  // Các methods được re-export từ file con
  chat: async (
    ...args: Parameters<typeof import("./ai-chat.service").aiChatService.chat>
  ) => {
    const { aiChatService } = await import("./ai-chat.service");
    return aiChatService.chat(...args);
  },

  chatStream: async function* (
    ...args: Parameters<
      typeof import("./ai-chat.service").aiChatService.chatStream
    >
  ) {
    const { aiChatService } = await import("./ai-chat.service");
    yield* aiChatService.chatStream(...args);
  },

  listConversations: async (
    ...args: Parameters<
      typeof import("./ai-chat.service").aiChatService.listConversations
    >
  ) => {
    const { aiChatService } = await import("./ai-chat.service");
    return aiChatService.listConversations(...args);
  },

  getConversationById: async (
    ...args: Parameters<
      typeof import("./ai-chat.service").aiChatService.getConversationById
    >
  ) => {
    const { aiChatService } = await import("./ai-chat.service");
    return aiChatService.getConversationById(...args);
  },

  schedulePlan: async (
    ...args: Parameters<
      typeof import("../scheduler/hybrid-schedule.service").hybridScheduleService.schedulePlan
    >
  ) => {
    const { hybridScheduleService } =
      await import("../scheduler/hybrid-schedule.service");
    return hybridScheduleService.schedulePlan(...args);
  },

  smartReschedule: async (
    ...args: Parameters<
      typeof import("./ai-reschedule.service").aiRescheduleService.smartReschedule
    >
  ) => {
    const { aiRescheduleService } = await import("./ai-reschedule.service");
    return aiRescheduleService.smartReschedule(...args);
  },

  taskBreakdown: async (
    userId: string,
    input: { title: string; deadline?: Date; description?: string },
  ): Promise<{
    steps: {
      title: string;
      status: string;
      estimatedDuration?: number;
      difficulty?: "easy" | "medium" | "hard";
      description?: string;
    }[];
    totalEstimatedDuration?: number;
  }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    const cached = await aiCacheService.getTaskBreakdown({
      userId,
      title: input.title,
      deadline: input.deadline,
      description: input.description,
    });
    if (cached) {
      return cached;
    }

    const deadlineText = input.deadline
      ? `Hạn chót: ${input.deadline.toISOString()}`
      : "";

    const descriptionText = input.description
      ? `Mô tả: ${input.description}`
      : "";

    const prompt = `Hãy breakdown công việc sau thành các bước nhỏ, cụ thể, mỗi bước là MỘT đơn vị học tập riêng biệt.
Công việc: ${input.title}
${descriptionText}
${deadlineText}

Ví dụ: nếu công việc là "Học tiếng Anh 12 thì" thì phải tạo ĐÚNG 12 bước, mỗi bước là 1 thì (Present Simple, Present Continuous, Present Perfect, ...).
Nếu công việc là "Học lập trình Python cơ bản" thì tạo các bước như: Biến và kiểu dữ liệu, Câu lệnh điều kiện, Vòng lặp, Hàm, ...

Yêu cầu bắt buộc:
- KHÔNG gộp nhiều chủ đề vào 1 bước. Mỗi bước = 1 chủ đề cụ thể.
- Số bước phải phản ánh đúng số lượng thực tế trong công việc (VD: 12 thì = 12 bước).
- Trả về DUY NHẤT JSON hợp lệ (không markdown, không giải thích).
- Format: { "steps": [ { "title": string, "status": "todo", "estimatedDuration": number (phút), "difficulty": "easy"|"medium"|"hard", "description": string } ], "totalEstimatedDuration": number (phút) }
- status luôn là "todo".
- estimatedDuration là thời gian ước tính để hoàn thành bước đó (tính bằng phút).
- difficulty là độ khó: "easy", "medium", hoặc "hard".
- description là mô tả ngắn gọn (1-2 câu) về nội dung cần học/làm trong bước đó.
- totalEstimatedDuration là tổng thời gian ước tính cho cả công việc.`;

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
      maxTokens: 2000,
    });

    const raw = (result.content || "").trim();

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
        estimatedDuration:
          typeof s?.estimatedDuration === "number" && s.estimatedDuration > 0
            ? s.estimatedDuration
            : undefined,
        difficulty: ["easy", "medium", "hard"].includes(
          String(s?.difficulty ?? "").toLowerCase(),
        )
          ? (String(s.difficulty).toLowerCase() as "easy" | "medium" | "hard")
          : undefined,
        description: String(s?.description ?? "").trim() || undefined,
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
        estimatedDuration: s.estimatedDuration,
        difficulty: s.difficulty,
        description: s.description,
      })),
      totalEstimatedDuration:
        typeof parsed?.totalEstimatedDuration === "number" &&
        parsed.totalEstimatedDuration > 0
          ? parsed.totalEstimatedDuration
          : normalized.reduce(
              (sum: number, s: any) => sum + (s.estimatedDuration || 0),
              0,
            ),
    };

    await aiCacheService.setTaskBreakdown(
      {
        userId,
        title: input.title,
        deadline: input.deadline,
        description: input.description,
      },
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

    const prompt = `Hãy đề xuất mức độ ưu tiên cho công việc sau, dựa trên mức độ khẩn cấp và tác động.
Công việc: ${input.title}
${deadlineText}

Yêu cầu bắt buộc:
- Trả về DUY NHẤT JSON hợp lệ (không markdown, không giải thích).
- Format: { "priority": "low"|"medium"|"high"|"urgent", "reason": string }`;

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

    await aiCacheService.setPrioritySuggest(
      { userId, title: input.title, deadline: input.deadline },
      response,
    );

    return response;
  },
};
