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
    input: {
      title: string;
      deadline?: Date;
      description?: string;
      totalMinutes?: number;
      slots?: {
        date: string;
        day: string;
        time: string;
        durationMinutes?: number;
      }[];
    },
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
      totalMinutes: input.totalMinutes,
    });
    if (cached) {
      // Nếu cached nhưng totalMinutes khác → bỏ qua cache, tính lại
      const cachedTotal =
        cached.steps?.reduce(
          (s: number, x: any) => s + (x.estimatedDuration ?? 0),
          0,
        ) ?? 0;
      if (
        !input.totalMinutes ||
        Math.abs(cachedTotal - input.totalMinutes) < 5
      ) {
        return cached;
      }
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

    const rawSteps = Array.isArray(parsed?.steps) ? parsed.steps : null;
    if (!rawSteps) {
      throw new Error("AI_RESPONSE_INVALID");
    }

    const normalized = rawSteps
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

    let steps = normalized.map((s: any) => ({
      title: s.title,
      status:
        s.status === "todo" ||
        s.status === "in_progress" ||
        s.status === "completed" ||
        s.status === "cancelled"
          ? s.status
          : "todo",
      estimatedDuration: s.estimatedDuration as number | undefined,
      difficulty: s.difficulty as "easy" | "medium" | "hard" | undefined,
      description: s.description as string | undefined,
    }));

    // Post-processing: scale thời gian để tổng = totalMinutes chính xác
    if (input.totalMinutes && input.totalMinutes > 0 && steps.length > 0) {
      const currentTotal = steps.reduce(
        (sum: number, s: { estimatedDuration?: number }) =>
          sum + (s.estimatedDuration ?? 60),
        0,
      );
      if (currentTotal > 0) {
        const scale = input.totalMinutes / currentTotal;

        // Bước 1: Scale tất cả subtasks (chưa làm tròn)
        const scaledDurations = steps.map((s: { estimatedDuration?: number }) =>
          Math.max(5, (s.estimatedDuration ?? 60) * scale),
        );

        // Bước 2: Làm tròn xuống bội số 5 cho tất cả
        const roundedDurations = scaledDurations.map(
          (d: number) => Math.floor(d / 5) * 5,
        );

        // Bước 3: Tính phần dư cần phân bổ
        const roundedTotal = roundedDurations.reduce(
          (sum: number, d: number) => sum + d,
          0,
        );
        let remainder = input.totalMinutes - roundedTotal;

        // Bước 4: Phân bổ phần dư (mỗi lần +5 phút) cho các subtask có phần lẻ lớn nhất
        const fractionalParts = scaledDurations.map((d: number, i: number) => ({
          index: i,
          fraction: d - roundedDurations[i],
        }));

        // Sắp xếp theo phần lẻ giảm dần
        fractionalParts.sort(
          (
            a: { index: number; fraction: number },
            b: { index: number; fraction: number },
          ) => b.fraction - a.fraction,
        );

        // Phân bổ phần dư
        for (let i = 0; i < fractionalParts.length && remainder >= 5; i++) {
          const idx = fractionalParts[i].index;
          roundedDurations[idx] += 5;
          remainder -= 5;
        }

        // Bước 5: Nếu vẫn còn dư (< 5 phút), cộng vào subtask cuối
        if (remainder > 0) {
          roundedDurations[roundedDurations.length - 1] += remainder;
        }

        // Bước 6: Gán lại estimatedDuration
        steps = steps.map(
          (
            s: {
              title: string;
              status: string;
              estimatedDuration?: number;
              difficulty?: "easy" | "medium" | "hard";
              description?: string;
            },
            i: number,
          ) => ({
            ...s,
            estimatedDuration: Math.max(5, roundedDurations[i]),
          }),
        );
      }
    }

    const response = {
      steps,
      totalEstimatedDuration:
        input.totalMinutes && input.totalMinutes > 0
          ? input.totalMinutes
          : steps.reduce(
              (sum: number, s: { estimatedDuration?: number }) =>
                sum + (s.estimatedDuration ?? 0),
              0,
            ),
    };

    await aiCacheService.setTaskBreakdown(
      {
        userId,
        title: input.title,
        deadline: input.deadline,
        description: input.description,
        totalMinutes: input.totalMinutes,
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
