"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiService = exports.aiRescheduleService = exports.aiScheduleService = exports.aiChatService = void 0;
const mongoose_1 = require("mongoose");
const ai_provider_1 = require("./ai.provider");
const ai_cache_service_1 = require("./ai.cache.service");
const ai_utils_1 = require("./ai-utils");
// Re-export từ các service đã tách
var ai_chat_service_1 = require("./ai-chat.service");
Object.defineProperty(exports, "aiChatService", { enumerable: true, get: function () { return ai_chat_service_1.aiChatService; } });
var ai_schedule_service_1 = require("./ai-schedule.service");
Object.defineProperty(exports, "aiScheduleService", { enumerable: true, get: function () { return ai_schedule_service_1.aiScheduleService; } });
var ai_reschedule_service_1 = require("./ai-reschedule.service");
Object.defineProperty(exports, "aiRescheduleService", { enumerable: true, get: function () { return ai_reschedule_service_1.aiRescheduleService; } });
// Các functions còn lại trong ai.service.ts
exports.aiService = {
    // Các methods được re-export từ file con
    chat: async (...args) => {
        const { aiChatService } = await Promise.resolve().then(() => __importStar(require("./ai-chat.service")));
        return aiChatService.chat(...args);
    },
    chatStream: async function* (...args) {
        const { aiChatService } = await Promise.resolve().then(() => __importStar(require("./ai-chat.service")));
        yield* aiChatService.chatStream(...args);
    },
    listConversations: async (...args) => {
        const { aiChatService } = await Promise.resolve().then(() => __importStar(require("./ai-chat.service")));
        return aiChatService.listConversations(...args);
    },
    getConversationById: async (...args) => {
        const { aiChatService } = await Promise.resolve().then(() => __importStar(require("./ai-chat.service")));
        return aiChatService.getConversationById(...args);
    },
    schedulePlan: async (...args) => {
        const { hybridScheduleService } = await Promise.resolve().then(() => __importStar(require("../scheduler/hybrid-schedule.service")));
        return hybridScheduleService.schedulePlan(...args);
    },
    smartReschedule: async (...args) => {
        const { aiRescheduleService } = await Promise.resolve().then(() => __importStar(require("./ai-reschedule.service")));
        return aiRescheduleService.smartReschedule(...args);
    },
    taskBreakdown: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const cached = await ai_cache_service_1.aiCacheService.getTaskBreakdown({
            userId,
            title: input.title,
            deadline: input.deadline,
            description: input.description,
            totalMinutes: input.totalMinutes,
        });
        if (cached) {
            // Nếu cached nhưng totalMinutes khác → bỏ qua cache, tính lại
            const cachedTotal = cached.steps?.reduce((s, x) => s + (x.estimatedDuration ?? 0), 0) ?? 0;
            if (!input.totalMinutes ||
                Math.abs(cachedTotal - input.totalMinutes) < 5) {
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
        const result = await ai_provider_1.aiProvider.chat({
            messages: [
                {
                    role: "system",
                    content: "You are a productivity assistant. Reply in Vietnamese. Always output valid JSON when asked.",
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
        let parsed;
        try {
            parsed = JSON.parse((0, ai_utils_1.extractJson)(raw));
        }
        catch {
            throw new Error("AI_JSON_INVALID");
        }
        const rawSteps = Array.isArray(parsed?.steps) ? parsed.steps : null;
        if (!rawSteps) {
            throw new Error("AI_RESPONSE_INVALID");
        }
        const normalized = rawSteps
            .map((s) => ({
            title: String(s?.title ?? "").trim(),
            status: String(s?.status ?? "todo").trim() || "todo",
            estimatedDuration: typeof s?.estimatedDuration === "number" && s.estimatedDuration > 0
                ? s.estimatedDuration
                : undefined,
            difficulty: ["easy", "medium", "hard"].includes(String(s?.difficulty ?? "").toLowerCase())
                ? String(s.difficulty).toLowerCase()
                : undefined,
            description: String(s?.description ?? "").trim() || undefined,
        }))
            .filter((s) => s.title);
        if (!normalized.length) {
            throw new Error("AI_RESPONSE_INVALID");
        }
        let steps = normalized.map((s) => ({
            title: s.title,
            status: s.status === "todo" ||
                s.status === "in_progress" ||
                s.status === "completed" ||
                s.status === "cancelled"
                ? s.status
                : "todo",
            estimatedDuration: s.estimatedDuration,
            difficulty: s.difficulty,
            description: s.description,
        }));
        // Post-processing: scale thời gian để tổng = totalMinutes chính xác
        if (input.totalMinutes && input.totalMinutes > 0 && steps.length > 0) {
            const currentTotal = steps.reduce((sum, s) => sum + (s.estimatedDuration ?? 60), 0);
            if (currentTotal > 0) {
                const scale = input.totalMinutes / currentTotal;
                // Bước 1: Scale tất cả subtasks (chưa làm tròn)
                const scaledDurations = steps.map((s) => Math.max(5, (s.estimatedDuration ?? 60) * scale));
                // Bước 2: Làm tròn xuống bội số 5 cho tất cả
                const roundedDurations = scaledDurations.map((d) => Math.floor(d / 5) * 5);
                // Bước 3: Tính phần dư cần phân bổ
                const roundedTotal = roundedDurations.reduce((sum, d) => sum + d, 0);
                let remainder = input.totalMinutes - roundedTotal;
                // Bước 4: Phân bổ phần dư (mỗi lần +5 phút) cho các subtask có phần lẻ lớn nhất
                const fractionalParts = scaledDurations.map((d, i) => ({
                    index: i,
                    fraction: d - roundedDurations[i],
                }));
                // Sắp xếp theo phần lẻ giảm dần
                fractionalParts.sort((a, b) => b.fraction - a.fraction);
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
                steps = steps.map((s, i) => ({
                    ...s,
                    estimatedDuration: Math.max(5, roundedDurations[i]),
                }));
            }
        }
        const response = {
            steps,
            totalEstimatedDuration: input.totalMinutes && input.totalMinutes > 0
                ? input.totalMinutes
                : steps.reduce((sum, s) => sum + (s.estimatedDuration ?? 0), 0),
        };
        await ai_cache_service_1.aiCacheService.setTaskBreakdown({
            userId,
            title: input.title,
            deadline: input.deadline,
            description: input.description,
            totalMinutes: input.totalMinutes,
        }, response);
        return response;
    },
    prioritySuggest: async (userId, input) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const cached = await ai_cache_service_1.aiCacheService.getPrioritySuggest({
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
        const result = await ai_provider_1.aiProvider.chat({
            messages: [
                {
                    role: "system",
                    content: "You are a productivity assistant. Reply in Vietnamese. Always output valid JSON when asked.",
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
        let parsed;
        try {
            parsed = JSON.parse((0, ai_utils_1.extractJson)(raw));
        }
        catch {
            throw new Error("AI_JSON_INVALID");
        }
        const priorityRaw = String(parsed?.priority ?? "").trim();
        const reason = parsed?.reason !== undefined && parsed?.reason !== null
            ? String(parsed.reason).trim()
            : undefined;
        const normalizedPriority = priorityRaw === "low" ||
            priorityRaw === "medium" ||
            priorityRaw === "high" ||
            priorityRaw === "urgent"
            ? priorityRaw
            : "medium";
        const response = { priority: normalizedPriority, reason };
        await ai_cache_service_1.aiCacheService.setPrioritySuggest({ userId, title: input.title, deadline: input.deadline }, response);
        return response;
    },
};
