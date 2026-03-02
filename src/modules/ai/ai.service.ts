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
import { taskRepository } from "../task/task.repository";
import { userHabitRepository } from "../user/user-habit.repository";

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
  ): Promise<{
    steps: { title: string; status: string; estimatedDuration?: number }[];
    totalEstimatedDuration?: number;
  }> => {
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

    const prompt = `Hãy breakdown công việc sau thành các bước nhỏ, rõ ràng, có thể thực thi. Ước tính thời gian cho từng bước.
Công việc: ${input.title}
${deadlineText}

Yêu cầu bắt buộc:
- Trả về DUY NHẤT JSON hợp lệ (không markdown, không giải thích).
- Format: { "steps": [ { "title": string, "status": "todo", "estimatedDuration": number (phút) } ], "totalEstimatedDuration": number (phút) }
- status luôn là "todo".
- estimatedDuration là thời gian ước tính để hoàn thành bước đó (tính bằng phút).
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
        estimatedDuration:
          typeof s?.estimatedDuration === "number" && s.estimatedDuration > 0
            ? s.estimatedDuration
            : undefined,
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
    userId: string,
    input: { taskIds: string[]; startDate: Date },
  ): Promise<{
    schedule: {
      day: string;
      date: string;
      tasks: {
        taskId: string;
        title: string;
        priority: string;
        suggestedTime: string;
        reason: string;
      }[];
    }[];
    totalTasks: number;
    suggestedOrder: string[];
    personalizationNote: string;
  }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }
    const userObjectId = new Types.ObjectId(userId);

    // Fetch all tasks by IDs
    const tasks: any[] = [];
    for (const taskId of input.taskIds) {
      if (!Types.ObjectId.isValid(taskId)) {
        throw new Error("TASK_ID_INVALID");
      }
      const task = await taskRepository.findByIdForUser({
        taskId,
        userId: userObjectId,
      });
      if (!task) {
        throw new Error("TASK_NOT_FOUND");
      }
      tasks.push(task);
    }

    // Prepare task data for AI
    const taskData = tasks.map((t) => ({
      id: String(t._id),
      title: t.title,
      description: t.description || "",
      priority: t.priority,
      deadline: t.deadline ? t.deadline.toISOString() : null,
      status: t.status,
      estimatedDuration: t.estimatedDuration || null, // Phút dự kiến
    }));

    const startDateStr = input.startDate.toISOString().split("T")[0];

    // Calculate the number of days needed based on furthest deadline
    const deadlines = tasks
      .filter((t) => t.deadline)
      .map((t) => new Date(t.deadline!).getTime());
    const furthestDeadline =
      deadlines.length > 0 ? Math.max(...deadlines) : null;
    const startTime = input.startDate.getTime();
    const daysNeeded = furthestDeadline
      ? Math.max(
          1,
          Math.ceil((furthestDeadline - startTime) / (1000 * 60 * 60 * 24)) + 1,
        )
      : 7; // Default 7 days if no deadlines

    // Limit to reasonable range (1 to 365 days)
    const totalDays = Math.min(Math.max(daysNeeded, 1), 365);
    const endDate = new Date(input.startDate);
    endDate.setDate(endDate.getDate() + totalDays - 1);
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get current time for constraint
    const now = new Date();
    const currentHour = now.getHours();
    const currentDateStr = now.toISOString().split("T")[0];
    const isStartDateToday = startDateStr === currentDateStr;

    // Fetch user habits for personalized scheduling
    const userHabits = await userHabitRepository.findByUserId(userId);
    const productivityAnalysis =
      await userHabitRepository.analyzeProductivity(userId);

    // Prepare user preferences text
    let userPreferencesText = "";
    if (userHabits) {
      userPreferencesText += `\n\nThói quen người dùng:\n`;
      if (userHabits.productiveHours?.length) {
        userPreferencesText += `- Giờ làm việc hiệu quả: ${userHabits.productiveHours.map((h) => `${h.start}h-${h.end}h`).join(", ")}\n`;
      }
      if (
        userHabits.preferredWorkPattern &&
        userHabits.preferredWorkPattern !== "mixed"
      ) {
        const patternMap: Record<string, string> = {
          morning: "buổi sáng",
          afternoon: "buổi chiều",
          evening: "buổi tối",
        };
        userPreferencesText += `- Thích làm việc vào ${patternMap[userHabits.preferredWorkPattern] || userHabits.preferredWorkPattern}\n`;
      }
      userPreferencesText += `- Thời gian nghỉ giữa task: ${userHabits.preferredBreakDuration || 15} phút\n`;
      userPreferencesText += `- Thời gian tập trung tối đa: ${userHabits.maxFocusDuration || 90} phút\n`;
    }

    if (productivityAnalysis) {
      userPreferencesText += `- Tỷ lệ hoàn thành task: ${(productivityAnalysis.completionRate * 100).toFixed(0)}%\n`;
      if (productivityAnalysis.mostProductiveHours.length > 0) {
        userPreferencesText += `- Giờ hiệu quả nhất: ${productivityAnalysis.mostProductiveHours.slice(0, 3).join("h, ")}h\n`;
      }
    }

    // Add current time context and constraint
    const timeConstraintText = isStartDateToday
      ? `\nTHÔNG TIN QUAN TRỌNG:\n- Hôm nay là ngày ${currentDateStr}, hiện tại là ${currentHour}:00\n- BẮT BUỘC: Không được đề xuất thời gian trước ${currentHour + 1}:00 hôm nay (vì đã qua rồi)\n- Chỉ đề xuất khung giờ từ ${Math.max(currentHour + 1, 8)}:00 trở đi hôm nay, hoặc ngày mai\n`
      : "";

    const prompt = `Bạn là một AI chuyên gia lập kế hoạch và tối ưu lịch làm việc cá nhân. Hãy tạo lịch trình làm việc tối ưu và CÁ NHÂN HÓA.

============================
THÔNG TIN CỐ ĐỊNH:

Giờ làm việc mỗi ngày: 08:00 – 17:00
Nghỉ trưa: 12:00 – 13:00
Thời gian lập lịch: Từ ${startDateStr} đến ${endDateStr} (${totalDays} ngày)
${isStartDateToday ? `Thời gian hiện tại: ${currentHour}:00 (KHÔNG được đề xuất giờ trước ${Math.max(currentHour + 1, 8)}:00 hôm nay)` : ""}

============================
DANH SÁCH CÔNG VIỆC:
${JSON.stringify(taskData, null, 2)}

============================
THÓI QUEN NGƯỜI DÙNG:
${userPreferencesText}

============================
YÊU CẦU PHÂN TÍCH (phải thực hiện đầy đủ 5 bước):

BƯỚC 1 - Phân tích từng công việc:
- Phân tích công việc gồm những phần nhỏ nào
- Sử dụng estimatedDuration (nếu có) hoặc ước tính hợp lý
- Giải thích vì sao ước tính như vậy

BƯỚC 2 - Chia nhỏ công việc đa ngày:
- Nếu deadline nhiều ngày → chia đều hoặc chia thông minh theo độ khó
- Không chia đều máy móc, tối ưu theo workload từng ngày
- Giải thích logic chia

BƯỚC 3 - Phân tích slot trống cho ${totalDays} ngày:
- Xem từng ngày trong khoảng ${startDateStr} đến ${endDateStr} có những công việc gì
- Tính tổng thời gian đã chiếm dụng mỗi ngày
- Tìm slot trống hợp lý (tránh 12:00-13:00)

BƯỚC 4 - Tạo lịch cụ thể cho TẤT CẢ ${totalDays} ngày:
- Đặt công việc vào khung giờ làm việc
- Đảm bảo KHÔNG có công việc nào trùng thời gian
- Format thời gian: "HH:MM - HH:MM"
- PHẢI trả về đủ ${totalDays} ngày, mỗi ngày trong mảng schedule

BƯỚC 5 - Kiểm tra và tối ưu:
- Kiểm tra lại xem có trùng giờ không
- Nếu trùng phải điều chỉnh
- Đảm bảo tất cả công việc được sắp xếp trong ${totalDays} ngày

============================
NGUYÊN TẮC TỐI ƯU (bắt buộc tuân theo):

1. Công việc khó/ưu tiên cao → ưu tiên buổi sáng (08:00-12:00)
2. Công việc dài (>2 giờ) → chia nhỏ hoặc đặt vào slot rảnh dài
3. Không xếp sát giờ tan làm (16:30-17:00 chỉ cho task ngắn)
4. Thêm buffer 15 phút giữa các task
5. Mức năng lượng buổi sáng cao hơn buổi chiều 30%
6. Không xếp 2 công việc nặng liên tiếp
7. Sử dụng estimatedDuration để tính toán chính xác
8. Nếu tổng thời gian vượt quá khả năng → cảnh báo trong note

============================
FORMAT JSON OUTPUT:

{
  "schedule": [
    {
      "day": "Thứ Hai",
      "date": "YYYY-MM-DD",
      "tasks": [
        {
          "taskId": "id",
          "title": "Tên công việc",
          "priority": "high|medium|low",
          "suggestedTime": "08:00 - 10:00",
          "reason": "Giải thích chi tiết lý do chọn khung giờ này - bắt buộc phải có"
        }
      ]
    }
  ],
  "suggestedOrder": ["taskId1", "taskId2"],
  "personalizationNote": "Giải thích tổng quan tại sao lịch này phù hợp",
  "totalEstimatedTime": "Tổng thời gian ước tính",
  "splitStrategy": "Logic chia nhỏ công việc",
  "confidenceScore": 0.92
}

QUAN TRỌNG:
- Trả về DUY NHẤT JSON hợp lệ, không thêm text khác
- Mỗi task PHẢI có reason giải thích rõ ràng
- Không để trùng thời gian giữa các task trong cùng ngày
- PHẢI trả về đúng ${totalDays} ngày trong mảng schedule (từ ${startDateStr} đến ${endDateStr})
- Mỗi ngày phải có đầy đủ: day, date, tasks
- ${isStartDateToday ? `TUYỆT ĐỐI KHÔNG đề xuất giờ trước ${Math.max(currentHour + 1, 8)}:00 hôm nay` : "Tôn trọng khung giờ làm việc 08:00-17:00"}`;

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
      temperature: 0.3,
      maxTokens: 4000, // Tăng lên để có thể trả về nhiều ngày (tối đa 365 ngày)
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

    // Validate response
    if (
      !Array.isArray(parsed?.schedule) ||
      !Array.isArray(parsed?.suggestedOrder)
    ) {
      throw new Error("AI_RESPONSE_INVALID");
    }

    // Normalize dates in schedule and filter out past time slots
    const validateNow = new Date();
    const validateDateStr = validateNow.toISOString().split("T")[0];
    const validateHour = validateNow.getHours();
    const validateMinute = validateNow.getMinutes();

    const normalizedSchedule = parsed.schedule.map((day: any) => {
      const dayDate = String(day?.date ?? "");
      const isToday = dayDate === validateDateStr;

      // Filter tasks that are in the past
      const validTasks = Array.isArray(day?.tasks)
        ? day.tasks.filter((t: any) => {
            const suggestedTime = String(t?.suggestedTime ?? "");
            if (!isToday) return true; // Future dates are always valid

            // Parse time range (format: "HH:MM - HH:MM")
            const timeMatch = suggestedTime.match(
              /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/,
            );
            if (!timeMatch) return true;

            const startHour = parseInt(timeMatch[1], 10);
            const startMinute = parseInt(timeMatch[2], 10);

            // Check if start time is in the past (with 5 minute buffer)
            const startTimeMinutes = startHour * 60 + startMinute;
            const currentTimeMinutes = validateHour * 60 + validateMinute;

            return startTimeMinutes > currentTimeMinutes + 5; // Keep only future slots
          })
        : [];

      return {
        day: String(day?.day ?? ""),
        date: dayDate,
        tasks: validTasks.map((t: any) => ({
          taskId: String(t?.taskId ?? ""),
          title: String(t?.title ?? ""),
          priority: String(t?.priority ?? "medium"),
          suggestedTime: String(t?.suggestedTime ?? ""),
          reason: String(t?.reason ?? ""),
        })),
      };
    });

    // If today has no valid slots left, move remaining tasks to tomorrow
    const tomorrow = new Date(validateNow);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    const finalSchedule = normalizedSchedule.map((day: any, index: number) => {
      if (
        day.date === validateDateStr &&
        day.tasks.length === 0 &&
        index === 0
      ) {
        // First day is today but no valid slots - add a note
        return {
          ...day,
          tasks: [],
          note: "Hôm nay đã hết giờ làm việc, các công việc được chuyển sang ngày mai",
        };
      }
      return day;
    });
    // Không filter bỏ ngày nào - giữ lại tất cả các ngày để hiển thị đầy đủ lịch

    return {
      schedule: finalSchedule,
      totalTasks: tasks.length,
      suggestedOrder: parsed.suggestedOrder.map((id: any) => String(id)),
      personalizationNote: String(parsed?.personalizationNote ?? ""),
    };
  },

  smartReschedule: async (
    userId: string,
    input: {
      missedTask: {
        id: string;
        title: string;
        description?: string;
        priority: string;
        deadline?: Date;
        estimatedDuration?: number;
        originalScheduledTime?: { start: Date; end: Date };
      };
      reason?: string; // Lý do bỏ lỡ: "missed", "overlapping", "too_short", "manual"
    },
  ): Promise<{
    suggestion: {
      newStartTime: string; // Format: "HH:MM"
      newEndTime: string; // Format: "HH:MM"
      newDate: string; // Format: "YYYY-MM-DD"
      reason: string;
      confidence: "high" | "medium" | "low";
    };
    alternativeSlots?: {
      date: string;
      startTime: string;
      endTime: string;
      reason: string;
    }[];
    advice: string; // Lời khuyên để tránh bỏ lỡ lần sau
  }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    const { missedTask, reason = "missed" } = input;

    // Fetch user habits for personalized rescheduling
    const userHabits = await userHabitRepository.findByUserId(userId);
    const productivityAnalysis =
      await userHabitRepository.analyzeProductivity(userId);

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHour = now.getHours();

    // Prepare user preferences and context
    let contextText = "";
    contextText += `Hôm nay: ${today}, giờ hiện tại: ${currentHour}:00\n`;
    contextText += `Task bị bỏ lỡ: "${missedTask.title}"\n`;
    contextText += `Lý do bỏ lỡ: ${reason === "missed" ? "Không bắt đầu đúng giờ" : reason === "overlapping" ? "Trùng lịch với việc khác" : reason === "too_short" ? "Thời gian không đủ" : "Người dùng chủ động hoãn"}\n`;

    if (missedTask.estimatedDuration) {
      contextText += `Thời gian dự kiến: ${missedTask.estimatedDuration} phút\n`;
    }

    if (missedTask.deadline) {
      const deadlineStr = missedTask.deadline.toISOString().split("T")[0];
      contextText += `Hạn chót: ${deadlineStr}\n`;
    }

    if (userHabits) {
      contextText += `\nThói quen người dùng:\n`;
      if (userHabits.productiveHours?.length) {
        contextText += `- Giờ hiệu quả: ${userHabits.productiveHours.map((h) => `${h.start}h-${h.end}h`).join(", ")}\n`;
      }
      contextText += `- Thời gian nghỉ giữa task: ${userHabits.preferredBreakDuration || 15} phút\n`;
      contextText += `- Thời gian tập trung tối đa: ${userHabits.maxFocusDuration || 90} phút\n`;
    }

    if (productivityAnalysis) {
      contextText += `- Tỷ lệ hoàn thành: ${(productivityAnalysis.completionRate * 100).toFixed(0)}%\n`;
      if (productivityAnalysis.mostProductiveHours.length > 0) {
        contextText += `- Giờ hiệu quả nhất: ${productivityAnalysis.mostProductiveHours.slice(0, 3).join("h, ")}h\n`;
      }
    }

    const prompt = `Bạn là trợ lý AI giúp người dùng quản lý thời gian. Một task đã bị bỏ lỡ và cần được sắp xếp lại.

${contextText}

Hãy đề xuất thời gian mới tối ưu để hoàn thành task này. Ưu tiên:
1. Nếu còn trong ngày và có giờ hiệu quả phù hợp → đề xuất hôm nay
2. Nếu deadline gần → ưu tiên ngày mai
3. Nếu task lớn (estimatedDuration > 60 phút) → chia nhỏ hoặc chọn khung giờ rảnh dài
4. Đề xuất phải tôn trọng thói quen người dùng

Yêu cầu bắt buộc:
- Trả về DUY NHẤT JSON hợp lệ
- newDate phải từ hôm nay trở đi (format: YYYY-MM-DD)
- newStartTime và newEndTime trong khung 08:00-20:00
- Nếu task bị bỏ lỡ vì "too_short", hãy đề xuất thời gian dài hơn

Format JSON:
{
  "suggestion": {
    "newStartTime": "HH:MM",
    "newEndTime": "HH:MM",
    "newDate": "YYYY-MM-DD",
    "reason": "Lý do đề xuất thời gian này",
    "confidence": "high|medium|low"
  },
  "alternativeSlots": [
    {
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "reason": "Lý do"
    }
  ],
  "advice": "Lời khuyên để tránh bỏ lỡ lần sau (1-2 câu)"
}`;

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
      temperature: 0.3,
      maxTokens: 800,
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

    if (!parsed?.suggestion) {
      throw new Error("AI_RESPONSE_INVALID");
    }

    return {
      suggestion: {
        newStartTime: String(parsed.suggestion.newStartTime || "09:00"),
        newEndTime: String(parsed.suggestion.newEndTime || "10:00"),
        newDate: String(parsed.suggestion.newDate || today),
        reason: String(
          parsed.suggestion.reason || "Đề xuất dựa trên thói quen của bạn",
        ),
        confidence: ["high", "medium", "low"].includes(
          parsed.suggestion.confidence,
        )
          ? parsed.suggestion.confidence
          : "medium",
      },
      alternativeSlots: Array.isArray(parsed.alternativeSlots)
        ? parsed.alternativeSlots.map((slot: any) => ({
            date: String(slot.date || today),
            startTime: String(slot.startTime || "09:00"),
            endTime: String(slot.endTime || "10:00"),
            reason: String(slot.reason || "Khung giờ thay thế"),
          }))
        : undefined,
      advice: String(
        parsed.advice ||
          "Hãy cố gắng bắt đầu task đúng giờ để tạo thói quen tốt.",
      ),
    };
  },
};
