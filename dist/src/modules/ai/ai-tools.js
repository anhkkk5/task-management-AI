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
exports.executeToolCall = exports.AI_TOOL_DEFINITIONS = void 0;
const ai_calendar_context_service_1 = require("./ai-calendar-context.service");
const activity_scheduler_service_1 = require("./activity-scheduler.service");
const SCHEDULE_DEBUG_PREFIX = "[AI_SCHEDULE_DEBUG]";
const shortUser = (userId) => userId.length > 10 ? `${userId.slice(0, 6)}...${userId.slice(-4)}` : userId;
const logScheduleDebug = (event, payload) => {
    console.log(`${SCHEDULE_DEBUG_PREFIX} ${event}`, payload);
};
// Compute Vietnamese weekday label from a YYYY-MM-DD date string,
// using Asia/Ho_Chi_Minh timezone to avoid UTC drift.
const VI_WEEKDAYS = [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
];
const getWeekdayVi = (dateStr) => {
    // dateStr is YYYY-MM-DD (already local Asia/Ho_Chi_Minh from scheduler).
    // Construct as local-noon to avoid timezone day-shift.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m)
        return "";
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d, 12, 0, 0);
    return VI_WEEKDAYS[dt.getDay()] ?? "";
};
/**
 * OpenAI/Groq compatible tool schemas exposed to the LLM.
 * The LLM can request to call these tools by name + JSON args.
 * Handlers run server-side with the authenticated userId — userId is NEVER
 * trusted from the model.
 */
exports.AI_TOOL_DEFINITIONS = [
    {
        type: "function",
        function: {
            name: "get_free_busy_report",
            description: "Lấy lịch bận/rảnh của user trong khoảng [from,to]. Dùng khi user hỏi về thời gian rảnh hoặc trước khi đề xuất lịch.",
            parameters: {
                type: "object",
                properties: {
                    from: {
                        type: "string",
                        description: "ISO 8601 +07:00, vd '2026-04-27T00:00:00+07:00'.",
                    },
                    to: { type: "string", description: "ISO 8601 +07:00." },
                },
                required: ["from", "to"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "propose_schedule",
            description: "Đề xuất slot cho một hoặc nhiều hoạt động dựa trên free/busy. KHÔNG tạo task — chỉ propose.",
            parameters: {
                type: "object",
                properties: {
                    activityName: { type: "string", description: "Tên hoạt động." },
                    activities: {
                        type: "array",
                        description: "Danh sách nhiều hoạt động cần xếp cùng lúc. Nếu có field này thì ưu tiên dùng thay cho activityName/sessionsPerWeek đơn lẻ.",
                        items: {
                            type: "object",
                            properties: {
                                activityName: { type: "string" },
                                durationMin: { type: "number" },
                                sessionsPerWeek: { type: "number" },
                            },
                            required: ["activityName", "sessionsPerWeek"],
                        },
                    },
                    durationMin: { type: "number", description: "Phút/buổi." },
                    sessionsPerWeek: { type: "number", description: "Số buổi/tuần." },
                    windowStart: {
                        type: "string",
                        description: "HH:mm bắt đầu cửa sổ ưu tiên.",
                    },
                    windowEnd: { type: "string", description: "HH:mm kết thúc cửa sổ." },
                    daysAllowed: {
                        type: "array",
                        items: { type: "string" },
                        description: "VD: ['monday','wednesday']. Bỏ trống = mọi ngày.",
                    },
                    minGapDays: {
                        type: "number",
                        description: "Khoảng cách tối thiểu giữa 2 buổi (ngày). Mặc định 0.",
                    },
                    from: { type: "string", description: "ISO 8601 +07:00." },
                    to: { type: "string", description: "ISO 8601 +07:00." },
                },
                required: ["from", "to"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "breakdown_activity",
            description: "Chia hoạt động thành các buổi với focus + drills.",
            parameters: {
                type: "object",
                properties: {
                    activityName: { type: "string" },
                    totalSessions: { type: "number" },
                    durationMinPerSession: { type: "number" },
                },
                required: ["activityName", "totalSessions", "durationMinPerSession"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "commit_proposal",
            description: "TẠO THẬT các task từ draft đã lưu. Chỉ gọi khi user xác nhận chốt. Không cần tham số.",
            parameters: {
                type: "object",
                properties: {},
            },
        },
    },
];
const safeJsonParse = (raw) => {
    try {
        return JSON.parse(raw || "{}");
    }
    catch {
        return {};
    }
};
/**
 * Execute a tool call requested by the LLM. Always binds the trusted userId
 * server-side; ignores any userId in the model arguments.
 */
const executeToolCall = async (call, ctx) => {
    const args = safeJsonParse(call.arguments);
    logScheduleDebug("tool.received", {
        tool: call.name,
        callId: call.id,
        user: shortUser(ctx.userId),
        conversationId: ctx.conversationId || null,
    });
    if (call.name === "get_free_busy_report") {
        const from = String(args.from || "");
        const to = String(args.to || "");
        try {
            const snapshot = await ai_calendar_context_service_1.aiCalendarContextService.getCalendarSnapshot(ctx.userId, from, to);
            // Return compact representation to save tokens.
            const compact = {
                timezone: snapshot.timezone,
                range: snapshot.range,
                days: snapshot.days.map((d) => ({
                    date: d.date,
                    weekday: d.weekday,
                    busy: d.busySlots.map((b) => ({
                        start: b.start,
                        end: b.end,
                        title: b.title,
                    })),
                    free: d.freeSlots,
                })),
            };
            return {
                id: call.id,
                name: call.name,
                content: JSON.stringify(compact),
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "TOOL_EXECUTION_FAILED";
            logScheduleDebug("free_busy.error", {
                callId: call.id,
                user: shortUser(ctx.userId),
                message,
            });
            return {
                id: call.id,
                name: call.name,
                content: JSON.stringify({ error: message }),
            };
        }
    }
    if (call.name === "propose_schedule") {
        const activityName = String(args.activityName || "");
        const durationMin = Number(args.durationMin || 0);
        const sessionsPerWeek = Number(args.sessionsPerWeek || 0);
        const rawActivities = Array.isArray(args.activities) ? args.activities : [];
        const windowStart = String(args.windowStart || "00:00");
        const windowEnd = String(args.windowEnd || "23:59");
        const daysAllowed = Array.isArray(args.daysAllowed)
            ? args.daysAllowed.map((x) => String(x))
            : undefined;
        const minGapDays = Number(args.minGapDays ?? 0);
        const from = String(args.from || "");
        const to = String(args.to || "");
        logScheduleDebug("propose.input", {
            callId: call.id,
            user: shortUser(ctx.userId),
            activityName,
            sessionsPerWeek,
            durationMin,
            activitiesCount: rawActivities.length,
            windowStart,
            windowEnd,
            from,
            to,
        });
        try {
            const normalizedActivities = rawActivities
                .map((item) => {
                const entry = (item || {});
                return {
                    activityName: String(entry.activityName || "").trim(),
                    durationMin: Number((entry.durationMin ?? durationMin) || 0),
                    sessionsPerWeek: Number(entry.sessionsPerWeek ?? 0),
                };
            })
                .filter((item) => item.activityName && item.sessionsPerWeek > 0);
            if (normalizedActivities.length > 0) {
                logScheduleDebug("propose.batch.normalized", {
                    callId: call.id,
                    normalizedActivities,
                });
                const items = [];
                const reservedSlots = [];
                for (const activity of normalizedActivities) {
                    const result = await activity_scheduler_service_1.activitySchedulerService.proposeSchedule(ctx.userId, {
                        activityName: activity.activityName,
                        durationMin: activity.durationMin,
                        sessionsPerWeek: activity.sessionsPerWeek,
                        windowStart,
                        windowEnd,
                        daysAllowed,
                        minGapDays,
                        blockedSlots: reservedSlots,
                        fromISO: from,
                        toISO: to,
                    });
                    items.push({
                        activityName: activity.activityName,
                        durationMin: activity.durationMin,
                        sessionsPerWeek: activity.sessionsPerWeek,
                        proposals: result.proposals.map((p) => ({
                            date: p.date,
                            weekday: getWeekdayVi(p.date),
                            start: p.start,
                            end: p.end,
                            reason: p.reason,
                            score: p.score,
                        })),
                        unmetSessions: result.unmetSessions,
                        note: result.note,
                    });
                    for (const p of result.proposals) {
                        reservedSlots.push({ date: p.date, start: p.start, end: p.end });
                    }
                    logScheduleDebug("propose.batch.item_result", {
                        callId: call.id,
                        activityName: activity.activityName,
                        proposals: result.proposals.length,
                        unmetSessions: result.unmetSessions ?? 0,
                    });
                }
                logScheduleDebug("propose.batch.result", {
                    callId: call.id,
                    items: items.map((x) => ({
                        activityName: x.activityName,
                        proposals: x.proposals.length,
                        unmetSessions: x.unmetSessions ?? 0,
                    })),
                });
                return {
                    id: call.id,
                    name: call.name,
                    content: JSON.stringify({ items }),
                };
            }
            const result = await activity_scheduler_service_1.activitySchedulerService.proposeSchedule(ctx.userId, {
                activityName,
                durationMin,
                sessionsPerWeek,
                windowStart,
                windowEnd,
                daysAllowed,
                minGapDays,
                fromISO: from,
                toISO: to,
            });
            const compact = {
                activityName,
                durationMin,
                sessionsPerWeek,
                proposals: result.proposals.map((p) => ({
                    date: p.date,
                    weekday: getWeekdayVi(p.date),
                    start: p.start,
                    end: p.end,
                    reason: p.reason,
                    score: p.score,
                })),
                unmetSessions: result.unmetSessions,
                note: result.note,
            };
            logScheduleDebug("propose.single.result", {
                callId: call.id,
                activityName,
                proposals: result.proposals.length,
                unmetSessions: result.unmetSessions ?? 0,
            });
            return {
                id: call.id,
                name: call.name,
                content: JSON.stringify(compact),
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "TOOL_EXECUTION_FAILED";
            logScheduleDebug("propose.error", {
                callId: call.id,
                activityName,
                message,
            });
            return {
                id: call.id,
                name: call.name,
                content: JSON.stringify({ error: message }),
            };
        }
    }
    if (call.name === "commit_proposal") {
        if (!ctx.conversationId) {
            return {
                id: call.id,
                name: call.name,
                content: JSON.stringify({
                    error: "NO_CONVERSATION_CONTEXT",
                    message: "Không xác định được conversation để đọc draft.",
                }),
            };
        }
        try {
            const { commitProposalService } = await Promise.resolve().then(() => __importStar(require("./commit-proposal.service")));
            const result = await commitProposalService.commit({
                userId: ctx.userId,
                conversationId: ctx.conversationId,
            });
            logScheduleDebug("commit.result", {
                callId: call.id,
                user: shortUser(ctx.userId),
                conversationId: ctx.conversationId,
                ok: result.ok,
                createdCount: result.createdCount,
                error: result.error,
            });
            return {
                id: call.id,
                name: call.name,
                content: JSON.stringify(result),
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "TOOL_EXECUTION_FAILED";
            logScheduleDebug("commit.error", {
                callId: call.id,
                user: shortUser(ctx.userId),
                conversationId: ctx.conversationId,
                message,
            });
            return {
                id: call.id,
                name: call.name,
                content: JSON.stringify({ error: message }),
            };
        }
    }
    if (call.name === "breakdown_activity") {
        const activityName = String(args.activityName || "");
        const totalSessions = Number(args.totalSessions || 0);
        const durationMinPerSession = Number(args.durationMinPerSession || 0);
        try {
            const result = await activity_scheduler_service_1.activitySchedulerService.breakdownActivity({
                activityName,
                totalSessions,
                durationMinPerSession,
            });
            return {
                id: call.id,
                name: call.name,
                content: JSON.stringify(result),
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "TOOL_EXECUTION_FAILED";
            return {
                id: call.id,
                name: call.name,
                content: JSON.stringify({ error: message }),
            };
        }
    }
    return {
        id: call.id,
        name: call.name,
        content: JSON.stringify({ error: "UNKNOWN_TOOL" }),
    };
};
exports.executeToolCall = executeToolCall;
