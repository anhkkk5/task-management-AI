"use strict";
/**
 * ai-chat-helpers.ts
 * ------------------
 * Pure helper functions and shared types extracted from ai-chat.service.ts.
 * Everything here is stateless — no DB calls, no side-effects (except
 * `resolveConversation` which is the one async helper kept here for
 * co-location with ChatInput).
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCommitProposalReply = exports.CALENDAR_ONBOARDING_GUIDE = exports.ensureAssistantContent = exports.FALLBACK_ASSISTANT_REPLY = exports.parseAutoScheduleArgs = exports.isCommitConfirmationMessage = exports.isDetailedSchedulingRequest = exports.normalizeForIntent = exports.logScheduleDebug = exports.shortUser = void 0;
exports.resolveConversation = resolveConversation;
const mongoose_1 = require("mongoose");
const moment_timezone_1 = __importDefault(require("moment-timezone"));
const ai_repository_1 = require("./ai.repository");
const ai_context_1 = require("./ai-context");
// ─── Debug logging ───────────────────────────────────────────────────────────
const SCHEDULE_DEBUG_PREFIX = "[AI_SCHEDULE_DEBUG]";
const shortUser = (userId) => userId.length > 10 ? `${userId.slice(0, 6)}...${userId.slice(-4)}` : userId;
exports.shortUser = shortUser;
const logScheduleDebug = (event, payload) => {
    console.log(`${SCHEDULE_DEBUG_PREFIX} ${event}`, payload);
};
exports.logScheduleDebug = logScheduleDebug;
// ─── Text normalisation ──────────────────────────────────────────────────────
const normalizeForIntent = (text) => text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
exports.normalizeForIntent = normalizeForIntent;
// ─── Scheduling-request detection ────────────────────────────────────────────
const isDetailedSchedulingRequest = (text) => {
    const normalized = (0, exports.normalizeForIntent)(text);
    const scheduleVerb = /\b(sap xep|xep lich|len lich|lap lich|tao lich|dat lich|schedule|plan)\b/.test(normalized);
    if (!scheduleVerb)
        return false;
    const hasConcreteConstraints = /(\d+\s*(buoi|lan|session|tuan|week))/i.test(normalized) ||
        /(\d{1,2}\s*h\s*-\s*\d{1,2}\s*h)/i.test(normalized) ||
        /(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/i.test(normalized) ||
        /\b(khung gio|tuan nay|week|from|to|tu)\b/.test(normalized);
    return hasConcreteConstraints;
};
exports.isDetailedSchedulingRequest = isDetailedSchedulingRequest;
// ─── Commit-confirmation detection ───────────────────────────────────────────
const isCommitConfirmationMessage = (text) => {
    // A detailed scheduling request ("tạo lịch 3 buổi toán...") is a NEW command,
    // not a confirmation of an existing proposal. Reject early.
    if ((0, exports.isDetailedSchedulingRequest)(text))
        return false;
    const normalized = (0, exports.normalizeForIntent)(text).trim();
    if (!normalized)
        return false;
    // Phrase-level matches (cover natural Vietnamese / English confirmations).
    const phrasePatterns = [
        /\b(ok|oke|okela|okie|okay)\b/,
        /\b(yes|yep|yeah|sure|go|do it|proceed|let'?s go)\b/,
        /\b(dong y|nhat tri|duoc|duoc roi|chuan|chinh xac)\b/,
        /\b(chot|chot luon|chot di|chot nhe)\b/,
        /\bxac nhan\b/,
        /\bconfirm(ed)?\b/,
        // "tạo (lịch) ngay/luôn/đi", "tạo cho tôi", "tạo task"
        /\btao( ra)?( lich| task| cong viec)?( ngay| luon| di| nhe| cho toi)?\b/,
        // "xếp/sắp/lập/đặt lịch ..."
        /\b(xep lich|sap xep lich|lap lich|dat lich)( ngay| luon| di| nhe| cho toi)?\b/,
        // "lên lịch (ngay/luôn/đi/giúp/cho)"
        /\blen lich( ngay| luon| di| nhe| giup| cho toi| bay gio)?\b/,
        // "lịch luôn", "lịch đi"
        /\blich (luon|di|ngay|bay gio)\b/,
        // "lam di", "bat dau (di|ngay|luon)"
        /\b(lam di|bat dau( di| ngay| luon)?)\b/,
        // "tien hanh", "trien khai"
        /\b(tien hanh|trien khai)\b/,
    ];
    return phrasePatterns.some((re) => re.test(normalized));
};
exports.isCommitConfirmationMessage = isCommitConfirmationMessage;
// ─── Auto-parse scheduling args from a one-shot message ──────────────────────
const parseAutoScheduleArgs = (text) => {
    if (!(0, exports.isDetailedSchedulingRequest)(text))
        return null;
    const normalized = (0, exports.normalizeForIntent)(text); // for time/date parsing only
    // Use original lowercased text (preserving diacritics) for activity name extraction
    const lower = text.toLowerCase();
    const activities = [];
    // ── Strip schedule-verb prefix (both with and without diacritics)
    const stripped = lower
        .replace(/^.*?\b(sắp xếp|sap xep|xếp lịch|xep lich|lên lịch|len lich|lập lịch|lap lich|tạo lịch|tao lich|đặt lịch|dat lich|schedule|plan)\b\s*/, "")
        .replace(/\b(cho tôi|cho toi|giúp tôi|giup toi|cho mình|cho minh|giúp mình|giup minh)\b\s*/g, "")
        .trim();
    // ── Split by "và"/"va" to separate multiple activities
    const chunks = stripped.split(/\s+(?:và|va)\s+/);
    // Context stop-words (with + without diacritics): signal end of activity name
    const STOP_RE = /\s*\b(tuần|tuan|khung|từ|tu\s|from|trong|hàng|hang|mỗi|moi|lần|lan|session|week|tháng|thang|năm|nam)\b/;
    for (const chunk of chunks) {
        // Match both "buổi" (diacritics) and "buoi" (stripped)
        const buoiMatch = chunk.match(/(\d+)\s*(?:buổi|buoi)/);
        if (!buoiMatch || buoiMatch.index === undefined)
            continue;
        const sessionsPerWeek = Number(buoiMatch[1]);
        if (sessionsPerWeek <= 0)
            continue;
        const idx = buoiMatch.index;
        // ── Text BEFORE "N buổi" (handles "[name] N buổi/tuần" pattern)
        const rawBefore = chunk.slice(0, idx).trim();
        // ── Text AFTER "N buổi" (handles "N buổi [name]" pattern)
        const rawAfter = chunk
            .slice(idx + buoiMatch[0].length)
            .replace(/^[\s/,]+/, "") // remove leading "/" , spaces
            .trim();
        const cleanAfter = rawAfter
            .split(STOP_RE)[0]
            .replace(/[,.\s]+$/, "")
            .trim();
        // ── Pick the best activity name
        let activityName = "";
        if (cleanAfter.length > 1 && /^[\p{L}]/u.test(cleanAfter)) {
            // Pattern A: "N buổi [name]" — e.g. "3 buổi ngữ văn"
            activityName = cleanAfter;
        }
        if (!activityName && rawBefore.length > 1) {
            // Pattern B: "[name] N buổi" — e.g. "học môn toán 3 buổi/tuần"
            activityName = rawBefore;
        }
        // Capitalize first letter of each word for a proper title
        activityName = activityName
            .trim()
            .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
        if (activityName) {
            activities.push({ activityName, sessionsPerWeek, durationMin: 60 });
        }
    }
    if (activities.length === 0)
        return null;
    // ── Time window
    const timeMatch = normalized.match(/(\d{1,2})(?::(\d{2}))?\s*h?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*h?/);
    let windowStart = "21:00";
    let windowEnd = "22:00";
    let durationMin = 60;
    if (timeMatch) {
        const sh = Number(timeMatch[1] || 0);
        const sm = Number(timeMatch[2] || 0);
        const eh = Number(timeMatch[3] || 0);
        const em = Number(timeMatch[4] || 0);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        if (endMins > startMins) {
            windowStart = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
            windowEnd = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
            durationMin = endMins - startMins;
        }
    }
    // ── Date range
    const now = (0, moment_timezone_1.default)().tz("Asia/Ho_Chi_Minh");
    let from = now.clone().startOf("day");
    let to = now.clone().add(7, "day").endOf("day");
    if (/\b(tuan nay|this week)\b/.test(normalized)) {
        from = now.clone().startOf("isoWeek").startOf("day");
        to = now.clone().endOf("isoWeek").endOf("day");
    }
    const normalizedActivities = activities.map((item) => ({
        ...item,
        durationMin,
    }));
    return {
        activities: normalizedActivities,
        durationMin,
        windowStart,
        windowEnd,
        from: from.format("YYYY-MM-DDTHH:mm:ssZ"),
        to: to.format("YYYY-MM-DDTHH:mm:ssZ"),
    };
};
exports.parseAutoScheduleArgs = parseAutoScheduleArgs;
// ─── Constants & small formatters ────────────────────────────────────────────
exports.FALLBACK_ASSISTANT_REPLY = "Mình chưa tạo được phản hồi cho lượt này. Bạn thử nhắn lại chi tiết hơn nhé.";
const ensureAssistantContent = (raw) => {
    const trimmed = (raw ?? "").trim();
    return trimmed.length > 0 ? raw : exports.FALLBACK_ASSISTANT_REPLY;
};
exports.ensureAssistantContent = ensureAssistantContent;
exports.CALENDAR_ONBOARDING_GUIDE = "Hướng dẫn nhanh tạo lịch với AI:\n" +
    "1) Nói mục tiêu + thời lượng + khung giờ (vd: tập gym 120p, 3 buổi/tuần, chiều-tối).\n" +
    "2) Mình đề xuất lịch rảnh phù hợp, bạn xem và yêu cầu chỉnh nếu cần.\n" +
    "3) Bạn nhắn 'chốt'/'đồng ý' để tạo lịch thật, rồi kiểm tra ở tab Lịch.";
const buildCommitProposalReply = (payload) => {
    if (payload?.ok) {
        const count = Number(payload?.createdCount || 0);
        return count > 0
            ? `✅ Đã lên lịch thành công ${count} buổi. Vui lòng kiểm tra tab Lịch/Calendar.`
            : "Đã chốt lịch, nhưng chưa có công việc hợp lệ để tạo.";
    }
    if (typeof payload?.message === "string" && payload.message.trim()) {
        return payload.message;
    }
    return "Mình chưa thể chốt lịch. Bạn thử yêu cầu đề xuất lại rồi chốt giúp mình.";
};
exports.buildCommitProposalReply = buildCommitProposalReply;
// ─── Conversation resolution ─────────────────────────────────────────────────
/**
 * Resolve which conversation doc to use:
 *  1. Explicit conversationId (must belong to user).
 *  2. parentTaskId → find-or-create (so all subtasks of same parent share ONE thread).
 *  3. Create a brand-new standalone conversation.
 */
async function resolveConversation(userObjectId, input) {
    if (input.conversationId) {
        if (!mongoose_1.Types.ObjectId.isValid(input.conversationId)) {
            throw new Error("CONVERSATION_ID_INVALID");
        }
        const id = new mongoose_1.Types.ObjectId(input.conversationId);
        const existing = await ai_repository_1.aiRepository.findConversationByIdForUser({
            conversationId: id,
            userId: userObjectId,
        });
        if (!existing)
            throw new Error("CONVERSATION_FORBIDDEN");
        return { id, created: false, lastSubtaskKey: existing.lastSubtaskKey };
    }
    if (input.parentTaskId) {
        if (!mongoose_1.Types.ObjectId.isValid(input.parentTaskId)) {
            throw new Error("PARENT_TASK_ID_INVALID");
        }
        const parentTaskObjectId = new mongoose_1.Types.ObjectId(input.parentTaskId);
        const title = input.subtaskContext?.parentTaskTitle?.slice(0, 80) ||
            input.message.slice(0, 60);
        const domain = (0, ai_context_1.detectDomainFromTask)({
            parentTaskTitle: input.subtaskContext?.parentTaskTitle,
            parentTaskDescription: input.subtaskContext?.parentTaskDescription,
            subtaskTitle: input.subtaskContext?.subtaskTitle,
            subtaskDescription: input.subtaskContext?.description,
        });
        const { doc } = await ai_repository_1.aiRepository.findOrCreateConversationForParentTask({
            userId: userObjectId,
            parentTaskId: parentTaskObjectId,
            title,
            domain,
        });
        return { id: doc._id, created: false, lastSubtaskKey: doc.lastSubtaskKey };
    }
    const created = await ai_repository_1.aiRepository.createConversation({
        userId: userObjectId,
        title: input.message.slice(0, 60),
    });
    return { id: created._id, created: true };
}
