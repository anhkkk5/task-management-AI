import { aiCalendarContextService } from "./ai-calendar-context.service";
import { activitySchedulerService } from "./activity-scheduler.service";

/**
 * OpenAI/Groq compatible tool schemas exposed to the LLM.
 * The LLM can request to call these tools by name + JSON args.
 * Handlers run server-side with the authenticated userId — userId is NEVER
 * trusted from the model.
 */
export const AI_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "get_free_busy_report",
      description:
        "Lấy lịch bận/rảnh của user trong khoảng [from,to]. Dùng khi user hỏi về thời gian rảnh hoặc trước khi đề xuất lịch.",
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
    type: "function" as const,
    function: {
      name: "propose_schedule",
      description:
        "Đề xuất slot cho hoạt động (gym, học, đọc...) dựa trên free/busy. KHÔNG tạo task — chỉ propose.",
      parameters: {
        type: "object",
        properties: {
          activityName: { type: "string", description: "Tên hoạt động." },
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
            description:
              "Khoảng cách tối thiểu giữa 2 buổi (ngày). Mặc định 0.",
          },
          from: { type: "string", description: "ISO 8601 +07:00." },
          to: { type: "string", description: "ISO 8601 +07:00." },
        },
        required: [
          "activityName",
          "durationMin",
          "sessionsPerWeek",
          "from",
          "to",
        ],
      },
    },
  },
  {
    type: "function" as const,
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
    type: "function" as const,
    function: {
      name: "commit_proposal",
      description:
        "TẠO THẬT các task từ draft đã lưu. Chỉ gọi khi user xác nhận chốt. Không cần tham số.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

export type ToolCallRequest = {
  id: string;
  name: string;
  arguments: string; // raw JSON string from the model
};

export type ToolCallResult = {
  id: string;
  name: string;
  content: string; // JSON string returned to the model
};

const safeJsonParse = (raw: string): Record<string, unknown> => {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
};

/**
 * Execute a tool call requested by the LLM. Always binds the trusted userId
 * server-side; ignores any userId in the model arguments.
 */
export const executeToolCall = async (
  call: ToolCallRequest,
  ctx: { userId: string; conversationId?: string },
): Promise<ToolCallResult> => {
  const args = safeJsonParse(call.arguments);

  if (call.name === "get_free_busy_report") {
    const from = String(args.from || "");
    const to = String(args.to || "");
    try {
      const snapshot = await aiCalendarContextService.getCalendarSnapshot(
        ctx.userId,
        from,
        to,
      );
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
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "TOOL_EXECUTION_FAILED";
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
    const windowStart = String(args.windowStart || "00:00");
    const windowEnd = String(args.windowEnd || "23:59");
    const daysAllowed = Array.isArray(args.daysAllowed)
      ? args.daysAllowed.map((x: unknown) => String(x))
      : undefined;
    const minGapDays = Number(args.minGapDays ?? 0);
    const from = String(args.from || "");
    const to = String(args.to || "");

    try {
      const result = await activitySchedulerService.proposeSchedule(
        ctx.userId,
        {
          activityName,
          durationMin,
          sessionsPerWeek,
          windowStart,
          windowEnd,
          daysAllowed,
          minGapDays,
          fromISO: from,
          toISO: to,
        },
      );
      const compact = {
        proposals: result.proposals.map((p) => ({
          date: p.date,
          start: p.start,
          end: p.end,
          reason: p.reason,
          score: p.score,
        })),
      };
      return {
        id: call.id,
        name: call.name,
        content: JSON.stringify(compact),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "TOOL_EXECUTION_FAILED";
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
      const { commitProposalService } =
        await import("./commit-proposal.service");
      const result = await commitProposalService.commit({
        userId: ctx.userId,
        conversationId: ctx.conversationId,
      });
      return {
        id: call.id,
        name: call.name,
        content: JSON.stringify(result),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "TOOL_EXECUTION_FAILED";
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
      const result = await activitySchedulerService.breakdownActivity({
        activityName,
        totalSessions,
        durationMinPerSession,
      });
      return {
        id: call.id,
        name: call.name,
        content: JSON.stringify(result),
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "TOOL_EXECUTION_FAILED";
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
