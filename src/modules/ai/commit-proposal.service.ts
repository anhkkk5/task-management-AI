import { Types } from "mongoose";
import { aiRepository } from "./ai.repository";
import { taskRepository } from "../task/task.repository";
import { createDateWithTime } from "../scheduler/scheduler.utils";

const SCHEDULE_DEBUG_PREFIX = "[AI_SCHEDULE_DEBUG]";

const shortUser = (userId: string): string =>
  userId.length > 10 ? `${userId.slice(0, 6)}...${userId.slice(-4)}` : userId;

const logScheduleDebug = (event: string, payload: Record<string, unknown>) => {
  console.log(`${SCHEDULE_DEBUG_PREFIX} ${event}`, payload);
};

type CommitInput = {
  userId: string;
  conversationId: string;
};

type CommitResult = {
  ok: boolean;
  createdCount: number;
  taskIds: string[];
  summary?: {
    activityName?: string;
    sessions?: {
      taskId: string;
      date: string;
      start: string;
      end: string;
    }[];
    activities?: {
      activityName: string;
      sessions: {
        taskId: string;
        date: string;
        start: string;
        end: string;
      }[];
    }[];
  };
  error?: string;
  message?: string;
};

type DraftSession = {
  date: string;
  start: string;
  end: string;
  focus?: string;
};

type DraftItem = {
  activityName: string;
  durationMin: number;
  sessions?: DraftSession[];
};

const normalizeDraftItems = (draft: any): DraftItem[] => {
  if (Array.isArray(draft?.items) && draft.items.length > 0) {
    return draft.items
      .map((item: any) => ({
        activityName:
          String(item?.activityName || "Hoạt động").trim() || "Hoạt động",
        durationMin: Math.max(
          1,
          Number(item?.durationMin || draft?.durationMin || 60),
        ),
        sessions: Array.isArray(item?.sessions) ? item.sessions : [],
      }))
      .filter(
        (item: DraftItem) =>
          Array.isArray(item.sessions) && item.sessions.length > 0,
      );
  }

  if (Array.isArray(draft?.sessions) && draft.sessions.length > 0) {
    return [
      {
        activityName:
          String(draft?.activityName || "Hoạt động").trim() || "Hoạt động",
        durationMin: Math.max(1, Number(draft?.durationMin || 60)),
        sessions: draft.sessions,
      },
    ];
  }

  return [];
};

export const commitProposalService = {
  /**
   * Đọc proposalDraft từ conversation context, tạo task cho mỗi session,
   * sau đó clear draft. Idempotent: nếu draft đã rỗng -> trả về NO_DRAFT.
   */
  commit: async (input: CommitInput): Promise<CommitResult> => {
    logScheduleDebug("commit.service.entry", {
      user: shortUser(input.userId),
      conversationId: input.conversationId,
    });

    if (!Types.ObjectId.isValid(input.userId)) {
      return {
        ok: false,
        createdCount: 0,
        taskIds: [],
        error: "USER_ID_INVALID",
      };
    }
    if (!Types.ObjectId.isValid(input.conversationId)) {
      return {
        ok: false,
        createdCount: 0,
        taskIds: [],
        error: "CONVERSATION_ID_INVALID",
      };
    }

    const userObjectId = new Types.ObjectId(input.userId);
    const conversationObjectId = new Types.ObjectId(input.conversationId);

    const conversation = await aiRepository.findConversationByIdForUser({
      conversationId: conversationObjectId,
      userId: userObjectId,
    });

    if (!conversation) {
      return {
        ok: false,
        createdCount: 0,
        taskIds: [],
        error: "CONVERSATION_NOT_FOUND",
      };
    }

    const draft = (conversation as any).context?.proposalDraft;
    const draftItems = normalizeDraftItems(draft);
    logScheduleDebug("commit.service.draft", {
      user: shortUser(input.userId),
      conversationId: input.conversationId,
      hasDraft: !!draft,
      draftItems: draftItems.length,
    });
    if (!draft || draftItems.length === 0) {
      return {
        ok: false,
        createdCount: 0,
        taskIds: [],
        error: "NO_DRAFT",
        message:
          "Chưa có đề xuất nào để chốt. Vui lòng đề xuất lịch trước (gọi propose_schedule) rồi mới chốt.",
      };
    }

    const created: {
      taskId: string;
      date: string;
      start: string;
      end: string;
    }[] = [];
    const createdByActivity: {
      activityName: string;
      sessions: { taskId: string; date: string; start: string; end: string }[];
    }[] = [];

    for (const draftItem of draftItems) {
      const activityName = String(draftItem.activityName || "Hoạt động").trim();
      const durationMin = Math.max(1, Number(draftItem.durationMin || 0));
      const sessions = Array.isArray(draftItem.sessions)
        ? draftItem.sessions
        : [];

      const createdSessions: {
        taskId: string;
        date: string;
        start: string;
        end: string;
      }[] = [];

      for (let i = 0; i < sessions.length; i++) {
        const s = sessions[i];
        const [sh, sm] = String(s.start || "00:00")
          .split(":")
          .map((x) => parseInt(x, 10));
        const [eh, em] = String(s.end || "00:00")
          .split(":")
          .map((x) => parseInt(x, 10));

        if (
          Number.isNaN(sh) ||
          Number.isNaN(sm) ||
          Number.isNaN(eh) ||
          Number.isNaN(em)
        ) {
          continue;
        }

        const start = createDateWithTime(s.date, sh, sm);
        const end = createDateWithTime(s.date, eh, em);
        if (end.getTime() <= start.getTime()) continue;

        const title =
          sessions.length > 1
            ? `${activityName} — Buổi ${i + 1}`
            : activityName;

        const task = await taskRepository.create({
          title,
          description: s.focus || `${activityName} (AI scheduled)`,
          type: "todo",
          status: "scheduled",
          priority: "medium",
          startAt: start,
          deadline: end,
          tags: ["ai-scheduled"],
          userId: userObjectId,
          estimatedDuration: durationMin,
          scheduledTime: {
            start,
            end,
            aiPlanned: true,
            reason: `AI proposal: ${activityName}`,
          },
        });

        logScheduleDebug("commit.service.task_created", {
          taskId: String(task._id),
          title,
          date: s.date,
          start: s.start,
          end: s.end,
          startISO: start.toISOString(),
          endISO: end.toISOString(),
        });

        const createdItem = {
          taskId: String(task._id),
          date: s.date,
          start: s.start,
          end: s.end,
        };
        created.push(createdItem);
        createdSessions.push(createdItem);
      }

      if (createdSessions.length > 0) {
        createdByActivity.push({ activityName, sessions: createdSessions });
        logScheduleDebug("commit.service.activity_created", {
          user: shortUser(input.userId),
          conversationId: input.conversationId,
          activityName,
          createdSessions: createdSessions.length,
        });
      }
    }

    if (created.length === 0) {
      return {
        ok: false,
        createdCount: 0,
        taskIds: [],
        error: "NO_VALID_SESSIONS",
        message: "Không có buổi nào hợp lệ để tạo task.",
      };
    }

    // Clear draft sau khi commit thành công
    await aiRepository.updateConversationContext({
      conversationId: conversationObjectId,
      userId: userObjectId,
      context: {
        domain: (conversation as any).context?.domain,
        lastSubtaskKey: (conversation as any).context?.lastSubtaskKey,
        proposalDraft: undefined,
      },
    });

    return {
      ok: true,
      createdCount: created.length,
      taskIds: created.map((c) => c.taskId),
      summary: {
        activityName: createdByActivity[0]?.activityName,
        sessions: created,
        activities: createdByActivity,
      },
    };
  },
};
