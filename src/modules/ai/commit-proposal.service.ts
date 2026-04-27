import { Types } from "mongoose";
import { aiRepository } from "./ai.repository";
import { taskRepository } from "../task/task.repository";
import { createDateWithTime } from "../scheduler/scheduler.utils";

type CommitInput = {
  userId: string;
  conversationId: string;
};

type CommitResult = {
  ok: boolean;
  createdCount: number;
  taskIds: string[];
  summary?: {
    activityName: string;
    sessions: {
      taskId: string;
      date: string;
      start: string;
      end: string;
    }[];
  };
  error?: string;
  message?: string;
};

export const commitProposalService = {
  /**
   * Đọc proposalDraft từ conversation context, tạo task cho mỗi session,
   * sau đó clear draft. Idempotent: nếu draft đã rỗng -> trả về NO_DRAFT.
   */
  commit: async (input: CommitInput): Promise<CommitResult> => {
    if (!Types.ObjectId.isValid(input.userId)) {
      return { ok: false, createdCount: 0, taskIds: [], error: "USER_ID_INVALID" };
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
    if (!draft || !Array.isArray(draft.sessions) || draft.sessions.length === 0) {
      return {
        ok: false,
        createdCount: 0,
        taskIds: [],
        error: "NO_DRAFT",
        message:
          "Chưa có đề xuất nào để chốt. Vui lòng đề xuất lịch trước (gọi propose_schedule) rồi mới chốt.",
      };
    }

    const activityName = String(draft.activityName || "Hoạt động").trim();
    const durationMin = Math.max(1, Number(draft.durationMin || 0));
    const sessions = draft.sessions as {
      date: string;
      start: string;
      end: string;
      focus?: string;
    }[];

    const created: { taskId: string; date: string; start: string; end: string }[] =
      [];

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

      created.push({
        taskId: String(task._id),
        date: s.date,
        start: s.start,
        end: s.end,
      });
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
        activityName,
        sessions: created,
      },
    };
  },
};
