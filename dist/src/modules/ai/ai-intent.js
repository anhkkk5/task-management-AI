"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TASKMIND_KNOWLEDGE = void 0;
exports.detectUserLanguage = detectUserLanguage;
exports.resolveTargetLanguage = resolveTargetLanguage;
exports.detectIntent = detectIntent;
exports.buildSystemPrompt = buildSystemPrompt;
const LANG_NAMES = {
    vi: "Vietnamese",
    en: "English",
    jp: "Japanese",
    fr: "French",
    ko: "Korean",
    zh: "Chinese",
    unknown: "the same language as the user",
};
// ─── Detect user language from message ───────────────────────────────────────
function detectUserLanguage(text) {
    if (/[àáạảãăắằẳẵặâấầẩẫậđèéẹẻẽêếềểễệìíịỉĩòóọỏõôốồổỗộơớờởỡợùúụủũưứừửữựỳýỵỷỹ]/i.test(text)) {
        return "vi";
    }
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text)) {
        return "jp";
    }
    if (/[\uAC00-\uD7AF]/.test(text)) {
        return "ko";
    }
    if (/[àâçèéêëîïôùûüÿœæ]/i.test(text)) {
        return "fr";
    }
    if (/[a-zA-Z]/.test(text)) {
        return "en";
    }
    return "unknown";
}
// ─── Resolve target learning language from context ───────────────────────────
function resolveTargetLanguage(subtaskContext) {
    if (!subtaskContext)
        return "en";
    const combined = `${subtaskContext.parentTaskTitle || ""} ${subtaskContext.subtaskTitle || ""}`.toLowerCase();
    if (/tiếng anh|english|ielts|toeic|toefl/.test(combined))
        return "en";
    if (/tiếng nhật|japanese|日本語/.test(combined))
        return "jp";
    if (/tiếng hàn|korean|한국어/.test(combined))
        return "ko";
    if (/tiếng pháp|french|français/.test(combined))
        return "fr";
    if (/tiếng trung|chinese|中文|普通话/.test(combined))
        return "zh";
    return "en"; // default
}
// ─── TaskMind AI System Knowledge ────────────────────────────────────────────
exports.TASKMIND_KNOWLEDGE = `
=====================
TASKMIND AI - SYSTEM KNOWLEDGE (use when user asks about the app):

TaskMind AI là ứng dụng quản lý công việc thông minh tích hợp AI. Gồm các trang:

## 1. Công việc AI (/tasks)
- Xem danh sách tất cả công việc
- Tạo công việc mới: nhấn "+ Thêm công việc" → điền tiêu đề, mô tả, ưu tiên, hạn chót, thời gian dự kiến, mục tiêu/ngày
- Chỉnh sửa/xóa: nhấn "..." ở cuối mỗi hàng
- AI Breakdown: nhấn "..." → "AI Breakdown" → AI tự chia nhỏ công việc thành các bước
- Đổi trạng thái: click dropdown trạng thái (Chưa xử lý / Đã lên lịch / Đang làm / Hoàn thành)
- AI Tối Ưu Lịch: nhấn nút "AI Tối Ưu Lịch" → AI sắp xếp lịch học/làm tối ưu → xem preview → "Áp dụng lịch trình"

## 2. Lịch (/calendar)
- Xem lịch theo tuần/tháng
- Các buổi học/làm việc được AI sắp xếp hiển thị ở đây
- Click vào buổi để xem chi tiết
- Kéo thả để thay đổi thời gian

## 3. Chat AI (/chat)
- Chat với AI về mọi chủ đề: học tập, công việc, lập trình, tiếng Anh...
- Tạo đoạn chat mới: nhấn "+ Đoạn chat mới"
- Xem lịch sử: sidebar trái hiển thị các cuộc trò chuyện gần đây
- Bôi đen text → nhấn "Hỏi về đoạn này" để hỏi về nội dung đó
- Đổi tên/xóa conversation: nhấn "..." bên cạnh tên conversation

## 4. Nhóm (/teams)
- Quản lý nhóm làm việc
- Mời thành viên qua email

## 5. Thông báo (/notifications)
- Xem tất cả thông báo về deadline, lịch học, cập nhật

## 6. Chatbot (nút tròn góc phải màn hình)
- Hỗ trợ nhanh mọi lúc mọi nơi
- Click vào bước trong AI Breakdown → chatbot tự động hiểu context và dạy về bước đó

## Luồng sử dụng cơ bản:
1. Tạo công việc → điền thông tin đầy đủ (đặc biệt thời gian dự kiến + mục tiêu/ngày)
2. Nhấn "AI Tối Ưu Lịch" → AI sắp xếp lịch tối ưu
3. Xem lịch trên trang Lịch
4. Nhấn "AI Breakdown" để chia nhỏ công việc
5. Click vào từng bước → chatbot hỗ trợ học/làm từng bước

## Mẹo sử dụng:
- Điền "Thời gian dự kiến" và "Mục tiêu/ngày" để AI lên lịch chính xác hơn
- Dùng tags để phân loại công việc
- AI Breakdown hoạt động tốt nhất với công việc học tập hoặc dự án có nhiều bước
=====================`;
function detectIntent(message) {
    const text = message.toLowerCase();
    // System help - check first
    if (/\b(hướng dẫn|cách dùng|cách sử dụng|làm thế nào để|how to use|trang web|hệ thống|taskmind|tính năng|chức năng|ai breakdown|tối ưu lịch|lên lịch|công việc ai|trợ giúp|hỗ trợ sử dụng)\b/.test(text)) {
        return "SYSTEM_HELP";
    }
    if (/\b(đáp án|answer|correct|wrong|check|chấm|kiểm tra|tôi nghĩ|i think|my answer|câu trả lời)\b/.test(text)) {
        return "CHECK_ANSWER";
    }
    if (/\b(bài tập|exercise|practice|quiz|test|cho.*bài|give.*exercise|tạo.*bài|generate|luyện tập|drill)\b/.test(text)) {
        return "EXERCISE";
    }
    if (/\b(giải thích|explain|what is|là gì|nghĩa là|how to|cách|tại sao|why|define|định nghĩa|lý thuyết|theory)\b/.test(text)) {
        return "EXPLAIN";
    }
    return "CHAT";
}
// ─── Build system prompt (2-layer language system) ────────────────────────────
function buildSystemPrompt(params) {
    const { userLang, targetLang, intent, subtaskContext, customSystemPrompt } = params;
    const userLangName = LANG_NAMES[userLang];
    const targetLangName = LANG_NAMES[targetLang];
    // If FE provides custom system prompt, use it but inject language rules
    if (customSystemPrompt) {
        return (customSystemPrompt +
            `\n\n=====================\nFINAL LANGUAGE RULES (HIGHEST PRIORITY - OVERRIDE EVERYTHING):\n` +
            `- Explanation & feedback: MUST be in ${userLangName}\n` +
            `- Exercises & examples: MUST be in ${targetLangName}\n` +
            `- NEVER translate exercises into ${userLangName}\n` +
            `- DO NOT mix languages in the same section`);
    }
    const base = `You are a highly intelligent AI assistant integrated in TaskMind AI.

CORE CAPABILITIES:
- Teaching languages, math, physics, programming, and more
- Answering knowledge questions across all domains
- Casual conversation and life advice
- Task planning and productivity support
- Explaining how to use TaskMind AI system

${exports.TASKMIND_KNOWLEDGE}`;
    const languageConfig = `
=====================
LANGUAGE CONFIG:
- User Language: ${userLangName}
- Target Learning Language: ${targetLangName}

STRICT LANGUAGE RULES (HIGHEST PRIORITY):
1. Explanation & feedback → MUST be in ${userLangName}
2. Examples & Exercises → MUST be in ${targetLangName}
3. Answers → MUST be in ${targetLangName}
4. NEVER translate exercises into ${userLangName}
5. NEVER mix languages in the same section`;
    const intentPrompts = {
        SYSTEM_HELP: `
=====================
CURRENT MODE: SYSTEM GUIDE

The user is asking about how to use TaskMind AI. Use the TASKMIND AI SYSTEM KNOWLEDGE above to answer clearly.
- Answer in ${userLangName}
- Be specific with step-by-step instructions
- Use bullet points and numbered lists for clarity`,
        EXERCISE: `
=====================
CURRENT MODE: EXERCISE GENERATOR

When user asks for exercises on MULTIPLE tenses/topics, create ONE SECTION PER TENSE with this format:

---

## 🕐 [Tense Name] (e.g. Present Simple)

**Fill in the blank:**
1. She ___ (go) to school every day.
2. They ___ (play) football on Sundays.

**Multiple choice:**
1. She ___ coffee every morning.

   > A. drink
   > B. drinks ✓
   > C. drinking

2. They ___ in London.

   > A. lives
   > B. live ✓
   > C. living

**Answers:** 1. goes  2. play

---

## 🕑 [Next Tense Name]
(repeat same structure)

---

CRITICAL RULES:
- Each tense MUST have its own ## heading section
- Multiple choice options MUST be on SEPARATE LINES with > prefix
- NEVER put options on the same line as the question
- Exercises MUST be in ${targetLangName}
- Minimum 3 exercises per tense
- Always include answers at the end of each section`,
        CHECK_ANSWER: `
=====================
CURRENT MODE: ANSWER CHECKER

When student submits answers, respond in this format:

**Results:**
1. ✅ Correct / ❌ Incorrect — [brief explanation in ${userLangName}]
2. ✅ Correct / ❌ Incorrect — [brief explanation in ${userLangName}]

**Score:** X/Y correct

**Feedback:** (encouraging message in ${userLangName})`,
        EXPLAIN: `
=====================
CURRENT MODE: TUTOR

Structure your response as:

**[Concept Name]**

📌 **Definition:** (in ${userLangName})

📝 **Structure:** ...

✅ **Examples:** (in ${targetLangName})
- Example 1
- Example 2

⚠️ **Common mistakes:** (in ${targetLangName})

💡 **Tips:** (in ${userLangName})`,
        CHAT: `
=====================
CURRENT MODE: ASSISTANT

- Respond naturally and conversationally in ${userLangName}
- Be helpful and concise
- Don't be robotic`,
    };
    let prompt = base + languageConfig + intentPrompts[intent];
    // Add learning context if available
    if (subtaskContext) {
        const durationStr = subtaskContext.estimatedDuration
            ? `${subtaskContext.estimatedDuration} min`
            : "";
        const totalStr = subtaskContext.parentEstimatedDuration
            ? `${Math.round((subtaskContext.parentEstimatedDuration / 60) * 10) / 10}h`
            : "";
        const dailyStr = subtaskContext.dailyTargetMin && subtaskContext.dailyTargetDuration
            ? `${Math.round((subtaskContext.dailyTargetMin / 60) * 10) / 10}h-${Math.round((subtaskContext.dailyTargetDuration / 60) * 10) / 10}h/day`
            : "";
        prompt +=
            `\n\n=====================\nLEARNING CONTEXT:\n` +
                `- Topic: "${subtaskContext.subtaskTitle}"\n` +
                `- Learning path: "${subtaskContext.parentTaskTitle}"\n` +
                (subtaskContext.parentTaskDescription
                    ? `- Description: ${subtaskContext.parentTaskDescription}\n`
                    : "") +
                (durationStr ? `- Time for this step: ${durationStr}\n` : "") +
                (totalStr ? `- Total path duration: ${totalStr}\n` : "") +
                (dailyStr ? `- Daily goal: ${dailyStr}\n` : "") +
                (subtaskContext.difficulty
                    ? `- Difficulty: ${subtaskContext.difficulty}\n`
                    : "") +
                (subtaskContext.description
                    ? `- Step content: ${subtaskContext.description}\n`
                    : "");
    }
    return prompt;
}
