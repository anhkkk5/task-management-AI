import { Types } from "mongoose";
import { aiProvider } from "./ai.provider";
import { userHabitRepository } from "../user/user-habit.repository";
import { extractJson } from "./ai-utils";

export const aiRescheduleService = {
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
      reason?: string;
    },
  ): Promise<{
    suggestion: {
      newStartTime: string;
      newEndTime: string;
      newDate: string;
      reason: string;
      confidence: "high" | "medium" | "low";
    };
    alternativeSlots?: {
      date: string;
      startTime: string;
      endTime: string;
      reason: string;
    }[];
    advice: string;
  }> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    const { missedTask, reason = "missed" } = input;

    const userHabits = await userHabitRepository.findByUserId(userId);
    const productivityAnalysis =
      await userHabitRepository.analyzeProductivity(userId);

    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const currentHour = now.getHours();

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
