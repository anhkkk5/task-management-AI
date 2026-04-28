import { Types } from "mongoose";
import moment from "moment-timezone";
import { aiProvider, AiChatStreamEvent, AiChatMessage } from "./ai.provider";
import { aiRepository } from "./ai.repository";
import {
  PublicAiConversation,
  PublicAiMessage,
  toPublicConversation,
  toPublicMessage,
} from "./ai.mapper";
import {
  detectIntent,
  detectUserLanguage,
  resolveTargetLanguage,
  buildSystemPrompt,
} from "./ai-intent";
import {
  buildDiscussedSubtasks,
  computePendingSlots,
  detectDomainFromTask,
  toMemoryHints,
} from "./ai-context";
import { userMemoryService } from "./user-memory.service";
import { AI_TOOL_DEFINITIONS, executeToolCall } from "./ai-tools";
import type { ProposalDraft, ProposalDraftItem } from "./ai-conversation.model";

const SCHEDULE_DEBUG_PREFIX = "[AI_SCHEDULE_DEBUG]";

const shortUser = (userId: string): string =>
  userId.length > 10 ? `${userId.slice(0, 6)}...${userId.slice(-4)}` : userId;

const logScheduleDebug = (event: string, payload: Record<string, unknown>) => {
  console.log(`${SCHEDULE_DEBUG_PREFIX} ${event}`, payload);
};

type SubtaskContextInput = {
  subtaskTitle?: string;
  parentTaskTitle?: string;
  parentTaskDescription?: string;
  estimatedDuration?: number;
  parentEstimatedDuration?: number;
  dailyTargetMin?: number;
  dailyTargetDuration?: number;
  difficulty?: string;
  description?: string;
  subtaskKey?: string;
  subtaskIndex?: number;
};

type ChatInput = {
  message: string;
  conversationId?: string;
  parentTaskId?: string;
  systemPrompt?: string;
  subtaskContext?: SubtaskContextInput;
  fewShotMessages?: { role: "user" | "assistant"; content: string }[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

const normalizeForIntent = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const isCommitConfirmationMessage = (text: string): boolean => {
  // A detailed scheduling request ("tạo lịch 3 buổi toán...") is a NEW command,
  // not a confirmation of an existing proposal. Reject early.
  if (isDetailedSchedulingRequest(text)) return false;

  const normalized = normalizeForIntent(text).trim();
  if (!normalized) return false;

  // Phrase-level matches (cover natural Vietnamese / English confirmations).
  const phrasePatterns: RegExp[] = [
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

const isDetailedSchedulingRequest = (text: string): boolean => {
  const normalized = normalizeForIntent(text);
  const scheduleVerb =
    /\b(sap xep|xep lich|len lich|lap lich|tao lich|dat lich|schedule|plan)\b/.test(
      normalized,
    );
  if (!scheduleVerb) return false;

  const hasConcreteConstraints =
    /(\d+\s*(buoi|lan|session|tuan|week))/i.test(normalized) ||
    /(\d{1,2}\s*h\s*-\s*\d{1,2}\s*h)/i.test(normalized) ||
    /(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/i.test(normalized) ||
    /\b(khung gio|tuan nay|week|from|to|tu)\b/.test(normalized);

  return hasConcreteConstraints;
};

const parseAutoScheduleArgs = (
  text: string,
): Record<string, unknown> | null => {
  if (!isDetailedSchedulingRequest(text)) return null;

  const normalized = normalizeForIntent(text); // for time/date parsing only
  // Use original lowercased text (preserving diacritics) for activity name extraction
  const lower = text.toLowerCase();
  const activities: {
    activityName: string;
    sessionsPerWeek: number;
    durationMin: number;
  }[] = [];

  // ── Strip schedule-verb prefix (both with and without diacritics)
  const stripped = lower
    .replace(
      /^.*?\b(sắp xếp|sap xep|xếp lịch|xep lich|lên lịch|len lich|lập lịch|lap lich|tạo lịch|tao lich|đặt lịch|dat lich|schedule|plan)\b\s*/,
      "",
    )
    .replace(
      /\b(cho tôi|cho toi|giúp tôi|giup toi|cho mình|cho minh|giúp mình|giup minh)\b\s*/g,
      "",
    )
    .trim();

  // ── Split by "và"/"va" to separate multiple activities
  const chunks = stripped.split(/\s+(?:và|va)\s+/);

  // Context stop-words (with + without diacritics): signal end of activity name
  const STOP_RE =
    /\s*\b(tuần|tuan|khung|từ|tu\s|from|trong|hàng|hang|mỗi|moi|lần|lan|session|week|tháng|thang|năm|nam)\b/;

  for (const chunk of chunks) {
    // Match both "buổi" (diacritics) and "buoi" (stripped)
    const buoiMatch = chunk.match(/(\d+)\s*(?:buổi|buoi)/);
    if (!buoiMatch || buoiMatch.index === undefined) continue;

    const sessionsPerWeek = Number(buoiMatch[1]);
    if (sessionsPerWeek <= 0) continue;

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

  if (activities.length === 0) return null;

  // ── Time window
  const timeMatch = normalized.match(
    /(\d{1,2})(?::(\d{2}))?\s*h?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*h?/,
  );
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
  const now = moment().tz("Asia/Ho_Chi_Minh");
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

const FALLBACK_ASSISTANT_REPLY =
  "Mình chưa tạo được phản hồi cho lượt này. Bạn thử nhắn lại chi tiết hơn nhé.";

const ensureAssistantContent = (raw: string | undefined | null): string => {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? raw! : FALLBACK_ASSISTANT_REPLY;
};

const CALENDAR_ONBOARDING_GUIDE =
  "Hướng dẫn nhanh tạo lịch với AI:\n" +
  "1) Nói mục tiêu + thời lượng + khung giờ (vd: tập gym 120p, 3 buổi/tuần, chiều-tối).\n" +
  "2) Mình đề xuất lịch rảnh phù hợp, bạn xem và yêu cầu chỉnh nếu cần.\n" +
  "3) Bạn nhắn 'chốt'/'đồng ý' để tạo lịch thật, rồi kiểm tra ở tab Lịch.";

const buildCommitProposalReply = (payload: any): string => {
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

const mapDraftSessions = (proposals: any[] | undefined) =>
  Array.isArray(proposals)
    ? proposals.map((p: any) => ({
        date: String(p?.date || ""),
        start: String(p?.start || ""),
        end: String(p?.end || ""),
        focus: undefined,
      }))
    : [];

const upsertProposalItem = (
  items: ProposalDraftItem[],
  candidate: ProposalDraftItem,
): ProposalDraftItem[] => {
  const key = candidate.activityName.trim().toLowerCase();
  const idx = items.findIndex(
    (x) => x.activityName.trim().toLowerCase() === key,
  );
  if (idx >= 0) {
    const next = [...items];
    next[idx] = candidate;
    return next;
  }
  return [...items, candidate];
};

const mergeProposalDraftFromTool = (
  currentDraft: ProposalDraft | undefined,
  callArguments: string,
  executedContent: string,
): ProposalDraft | undefined => {
  let args: any = {};
  let output: any = {};
  try {
    args = JSON.parse(callArguments || "{}");
  } catch {
    args = {};
  }
  try {
    output = JSON.parse(executedContent || "{}");
  } catch {
    output = {};
  }

  const incomingItems: ProposalDraftItem[] = [];

  if (Array.isArray(output?.items) && output.items.length > 0) {
    for (const item of output.items) {
      const activityName = String(item?.activityName || "").trim();
      const sessions = mapDraftSessions(item?.proposals);
      if (!activityName || sessions.length === 0) continue;
      incomingItems.push({
        activityName,
        durationMin: Number(item?.durationMin || args?.durationMin || 0),
        sessionsPerWeek: Number(item?.sessionsPerWeek || 0),
        windowStart: String(args?.windowStart || ""),
        windowEnd: String(args?.windowEnd || ""),
        daysAllowed: Array.isArray(args?.daysAllowed)
          ? args.daysAllowed.map((x: unknown) => String(x))
          : undefined,
        minGapDays: Number(args?.minGapDays ?? 0),
        sessions,
      });
    }
  } else {
    const sessions = mapDraftSessions(output?.proposals);
    const activityName = String(
      args?.activityName || output?.activityName || "",
    ).trim();
    if (activityName && sessions.length > 0) {
      incomingItems.push({
        activityName,
        durationMin: Number(args?.durationMin || output?.durationMin || 0),
        sessionsPerWeek: Number(
          args?.sessionsPerWeek || output?.sessionsPerWeek || 0,
        ),
        windowStart: String(args?.windowStart || ""),
        windowEnd: String(args?.windowEnd || ""),
        daysAllowed: Array.isArray(args?.daysAllowed)
          ? args.daysAllowed.map((x: unknown) => String(x))
          : undefined,
        minGapDays: Number(args?.minGapDays ?? 0),
        sessions,
      });
    }
  }

  if (incomingItems.length === 0) return currentDraft;

  let nextItems: ProposalDraftItem[] = [];
  if (currentDraft) {
    if (Array.isArray(currentDraft.items) && currentDraft.items.length > 0) {
      nextItems = [...currentDraft.items];
    } else if (
      Array.isArray(currentDraft.sessions) &&
      currentDraft.sessions.length > 0
    ) {
      nextItems = [
        {
          activityName: currentDraft.activityName,
          durationMin: currentDraft.durationMin,
          sessionsPerWeek: currentDraft.sessionsPerWeek,
          windowStart: currentDraft.windowStart,
          windowEnd: currentDraft.windowEnd,
          daysAllowed: currentDraft.daysAllowed,
          minGapDays: currentDraft.minGapDays,
          sessions: currentDraft.sessions,
        },
      ];
    }
  }

  for (const item of incomingItems) {
    nextItems = upsertProposalItem(nextItems, item);
  }

  if (nextItems.length === 0) return currentDraft;

  const primary = nextItems[0];
  return {
    activityName: primary.activityName,
    durationMin: primary.durationMin,
    sessionsPerWeek: primary.sessionsPerWeek,
    windowStart: primary.windowStart,
    windowEnd: primary.windowEnd,
    daysAllowed: primary.daysAllowed,
    minGapDays: primary.minGapDays,
    sessions: primary.sessions,
    items: nextItems.length > 1 ? nextItems : undefined,
    createdAt: new Date(),
  };
};

/**
 * Resolve which conversation doc to use:
 *  1. Explicit conversationId (must belong to user).
 *  2. parentTaskId → find-or-create (so all subtasks of same parent share ONE thread).
 *  3. Create a brand-new standalone conversation.
 */
async function resolveConversation(
  userObjectId: Types.ObjectId,
  input: ChatInput,
): Promise<{ id: Types.ObjectId; created: boolean; lastSubtaskKey?: string }> {
  if (input.conversationId) {
    if (!Types.ObjectId.isValid(input.conversationId)) {
      throw new Error("CONVERSATION_ID_INVALID");
    }
    const id = new Types.ObjectId(input.conversationId);
    const existing = await aiRepository.findConversationByIdForUser({
      conversationId: id,
      userId: userObjectId,
    });
    if (!existing) throw new Error("CONVERSATION_FORBIDDEN");
    return { id, created: false, lastSubtaskKey: existing.lastSubtaskKey };
  }

  if (input.parentTaskId) {
    if (!Types.ObjectId.isValid(input.parentTaskId)) {
      throw new Error("PARENT_TASK_ID_INVALID");
    }
    const parentTaskObjectId = new Types.ObjectId(input.parentTaskId);
    const title =
      input.subtaskContext?.parentTaskTitle?.slice(0, 80) ||
      input.message.slice(0, 60);
    const domain = detectDomainFromTask({
      parentTaskTitle: input.subtaskContext?.parentTaskTitle,
      parentTaskDescription: input.subtaskContext?.parentTaskDescription,
      subtaskTitle: input.subtaskContext?.subtaskTitle,
      subtaskDescription: input.subtaskContext?.description,
    });
    const { doc } = await aiRepository.findOrCreateConversationForParentTask({
      userId: userObjectId,
      parentTaskId: parentTaskObjectId,
      title,
      domain,
    });
    return { id: doc._id, created: false, lastSubtaskKey: doc.lastSubtaskKey };
  }

  const created = await aiRepository.createConversation({
    userId: userObjectId,
    title: input.message.slice(0, 60),
  });
  return { id: created._id, created: true };
}

export const aiChatService = {
  chat: async (
    userId: string,
    input: ChatInput,
  ): Promise<{
    reply: string;
    conversationId: string;
    model?: string;
    tasksCreated?: number;
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

    const { id: conversationObjectId, lastSubtaskKey } =
      await resolveConversation(userObjectId, input);

    // ── Load conversation history (for context + discussed subtasks)
    const historyMessages = await aiRepository.listMessagesByConversation({
      conversationId: conversationObjectId,
      userId: userObjectId,
      limit: 40,
    });

    // ── Detect subtask transition inside the SAME parent conversation
    const currentSubtaskKey = input.subtaskContext?.subtaskKey;
    const isSubtaskTransition =
      !!currentSubtaskKey &&
      !!lastSubtaskKey &&
      currentSubtaskKey !== lastSubtaskKey;

    if (isSubtaskTransition && input.subtaskContext?.subtaskTitle) {
      // Record transition note so the model knows focus changed.
      // Stored as 'system' role with meta.kind='transition' — not sent to
      // the model as a regular user turn, but summarized via discussedSubtasks.
      await aiRepository.createMessage({
        conversationId: conversationObjectId,
        userId: userObjectId,
        role: "system",
        content: `[TRANSITION] Người dùng chuyển sang nhiệm vụ: "${input.subtaskContext.subtaskTitle}"`,
        meta: {
          kind: "transition",
          subtaskKey: currentSubtaskKey,
          subtaskTitle: input.subtaskContext.subtaskTitle,
          subtaskIndex: input.subtaskContext.subtaskIndex,
        },
      });
    }

    // ── Save user message with subtask meta (for future discussedSubtasks derivation)
    await aiRepository.createMessage({
      conversationId: conversationObjectId,
      userId: userObjectId,
      role: "user",
      content: input.message,
      meta: currentSubtaskKey
        ? {
            kind: "chat",
            subtaskKey: currentSubtaskKey,
            subtaskTitle: input.subtaskContext?.subtaskTitle,
            subtaskIndex: input.subtaskContext?.subtaskIndex,
          }
        : undefined,
    });

    // ── Build smart system prompt
    const intent = detectIntent(input.message);
    const userLang = detectUserLanguage(input.message);
    const targetLang = resolveTargetLanguage(input.subtaskContext);

    const domain = detectDomainFromTask({
      parentTaskTitle: input.subtaskContext?.parentTaskTitle,
      parentTaskDescription: input.subtaskContext?.parentTaskDescription,
      subtaskTitle: input.subtaskContext?.subtaskTitle,
      subtaskDescription: input.subtaskContext?.description,
    });

    const memories = await userMemoryService.loadRelevantMemories(
      userObjectId,
      domain,
      20,
    );

    // Reload history including the transition + user just inserted so the
    // prompt sees the complete picture. Keep the call cheap by limiting.
    const freshHistory = await aiRepository.listMessagesByConversation({
      conversationId: conversationObjectId,
      userId: userObjectId,
      limit: 40,
    });

    const discussedSubtasks = buildDiscussedSubtasks(freshHistory);
    const pendingSlots = computePendingSlots({
      domain,
      memories,
      history: freshHistory,
    });

    const systemContent = buildSystemPrompt({
      userLang,
      targetLang,
      intent,
      subtaskContext: input.subtaskContext,
      customSystemPrompt: input.systemPrompt,
      memoryHints: toMemoryHints(memories),
      discussedSubtasks,
      pendingSlots,
    });

    // Chat-style history sent to LLM: skip 'system' meta (transition) entries,
    // keep only user/assistant turns so provider APIs accept them.
    // Cap to the last 12 turns and trim very long messages so the prompt
    // stays under Groq's 8k TPM cap on the OSS tier.
    const HISTORY_TURN_CAP = 12;
    const PER_MSG_CHAR_CAP = 1500;
    const historyForAI = historyMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-HISTORY_TURN_CAP)
      .map((m) => ({
        role:
          m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content:
          m.content.length > PER_MSG_CHAR_CAP
            ? `${m.content.slice(0, PER_MSG_CHAR_CAP)}…`
            : m.content,
      }));

    const fewShot =
      historyForAI.length === 0 && input.fewShotMessages?.length
        ? input.fewShotMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }))
        : [];

    // Note: We intentionally do NOT auto-inject a 14-day calendar snapshot
    // here. The model has the `get_free_busy_report` tool and will fetch the
    // exact range it needs. Pre-injecting bloats the prompt by ~3-4k tokens
    // every turn and easily blows past Groq's 8k TPM cap on the OSS tier.
    const baseSystemContent = systemContent;

    const baseMessages: AiChatMessage[] = [
      { role: "system", content: baseSystemContent },
      ...fewShot.map(
        (m) => ({ role: m.role, content: m.content }) as AiChatMessage,
      ),
      ...historyForAI.map(
        (m) => ({ role: m.role, content: m.content }) as AiChatMessage,
      ),
      { role: "user", content: input.message },
    ];

    let result: Awaited<ReturnType<typeof aiProvider.chat>> = {
      content: FALLBACK_ASSISTANT_REPLY,
      model: undefined,
      usage: undefined,
    };
    let tasksCreatedCount = 0;

    if (intent === "CALENDAR_QUERY") {
      const isNewDetailedSchedule = isDetailedSchedulingRequest(input.message);

      logScheduleDebug("chat.calendar.entry", {
        user: shortUser(userId),
        conversationId: String(conversationObjectId),
        isNewDetailedSchedule,
      });

      // Guard against stale draft commits: when the user provides a full new
      // scheduling command, drop old draft before running tool loop.
      if (isNewDetailedSchedule) {
        await aiRepository.updateConversationContext({
          conversationId: conversationObjectId,
          userId: userObjectId,
          context: {
            domain,
            lastSubtaskKey: currentSubtaskKey,
            proposalDraft: undefined,
          },
        });
        logScheduleDebug("chat.calendar.clear_stale_draft", {
          user: shortUser(userId),
          conversationId: String(conversationObjectId),
        });
      }

      // ── FAST PATH: one-shot detailed scheduling ──────────────────────
      // When the user provides all constraints (activities, sessions, time
      // window) in a single message, bypass the model tool-calling loop
      // and directly execute propose_schedule → commit_proposal.  This is
      // far more reliable than hoping the model calls the right tools.
      let fastPathHandled = false;
      if (isNewDetailedSchedule) {
        const autoArgs = parseAutoScheduleArgs(input.message);
        if (autoArgs) {
          logScheduleDebug("chat.calendar.fast_path.start", {
            user: shortUser(userId),
            conversationId: String(conversationObjectId),
            autoArgs,
          });

          try {
            // 1) propose_schedule
            const proposeExec = await executeToolCall(
              {
                id: `fast_propose_${Date.now()}`,
                name: "propose_schedule",
                arguments: JSON.stringify(autoArgs),
              },
              { userId, conversationId: String(conversationObjectId) },
            );

            await aiRepository.createMessage({
              conversationId: conversationObjectId,
              userId: userObjectId,
              role: "system",
              content: `[TOOL ${proposeExec.name}] ${proposeExec.content.slice(0, 4000)}`,
              meta: {
                kind: "tool_call",
                toolName: proposeExec.name,
                toolCallId: proposeExec.id,
              } as any,
            });

            const fastDraft = mergeProposalDraftFromTool(
              undefined,
              JSON.stringify(autoArgs),
              proposeExec.content,
            );

            if (fastDraft) {
              // 2) Save draft
              await aiRepository.updateConversationContext({
                conversationId: conversationObjectId,
                userId: userObjectId,
                context: {
                  domain,
                  lastSubtaskKey: currentSubtaskKey,
                  proposalDraft: fastDraft,
                },
              });

              // 3) commit_proposal
              const commitExec = await executeToolCall(
                {
                  id: `fast_commit_${Date.now()}`,
                  name: "commit_proposal",
                  arguments: "{}",
                },
                { userId, conversationId: String(conversationObjectId) },
              );

              await aiRepository.createMessage({
                conversationId: conversationObjectId,
                userId: userObjectId,
                role: "system",
                content: `[TOOL ${commitExec.name}] ${commitExec.content.slice(0, 4000)}`,
                meta: {
                  kind: "tool_call",
                  toolName: commitExec.name,
                  toolCallId: commitExec.id,
                } as any,
              });

              let commitPayload: any = null;
              try {
                commitPayload = JSON.parse(commitExec.content);
              } catch {
                /* ignore */
              }

              // 4) Build reply including unmet sessions info
              let replyText = buildCommitProposalReply(commitPayload);

              // Append per-activity unmet-sessions detail
              let proposeOutput: any = {};
              try {
                proposeOutput = JSON.parse(proposeExec.content);
              } catch {
                /* ignore */
              }
              if (Array.isArray(proposeOutput?.items)) {
                const unmetLines: string[] = [];
                for (const item of proposeOutput.items) {
                  if (item.unmetSessions > 0) {
                    unmetLines.push(
                      `⚠️ ${item.activityName}: thiếu ${item.unmetSessions} buổi (không đủ slot trống trong khung giờ).`,
                    );
                  }
                }
                if (unmetLines.length > 0) {
                  replyText += "\n\n" + unmetLines.join("\n");
                }
              }

              tasksCreatedCount = Number(commitPayload?.createdCount || 0);

              logScheduleDebug("chat.calendar.fast_path.done", {
                user: shortUser(userId),
                conversationId: String(conversationObjectId),
                ok: commitPayload?.ok,
                createdCount: tasksCreatedCount,
              });

              result = {
                content: replyText,
                model: undefined,
                usage: undefined,
              };
              fastPathHandled = true;
            } else {
              logScheduleDebug("chat.calendar.fast_path.no_draft", {
                user: shortUser(userId),
                conversationId: String(conversationObjectId),
                reason: "propose returned 0 viable sessions",
              });
              // Fall through to model tool loop
            }
          } catch (err) {
            logScheduleDebug("chat.calendar.fast_path.error", {
              user: shortUser(userId),
              conversationId: String(conversationObjectId),
              message: err instanceof Error ? err.message : String(err),
            });
            // Fall through to model tool loop
          }
        }
      }

      // ── MODEL TOOL LOOP (fallback when fast-path didn't handle) ──────
      if (!fastPathHandled) {
        // Tool-calling loop: let the model invoke get_free_busy_report (and any
        // future tools) before producing the final user-facing text.
        const toolMessages: AiChatMessage[] = [...baseMessages];
        const MAX_TOOL_ITERATIONS = 2;
        let iter = 0;
        let toolResult: Awaited<ReturnType<typeof aiProvider.chatWithTools>>;
        let proposalDraft: ProposalDraft | undefined = undefined;
        let didCommitProposalCall = false;
        let commitProposalReply: string | undefined = undefined;
        let forcedCommitReply: string | undefined = undefined;
        const shouldShowCalendarOnboarding = historyForAI.length === 0;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          toolResult = await aiProvider.chatWithTools({
            purpose: "chat",
            messages: toolMessages,
            model: input.model,
            temperature: 0.2,
            maxTokens: input.maxTokens,
            tools: AI_TOOL_DEFINITIONS,
            toolChoice: iter === 0 ? "auto" : "auto",
          });

          if (!toolResult.toolCalls || toolResult.toolCalls.length === 0) {
            break;
          }

          // Append assistant tool_calls turn
          toolMessages.push({
            role: "assistant",
            content: toolResult.content || "",
            tool_calls: toolResult.toolCalls.map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.name, arguments: c.arguments },
            })),
          });

          // Execute each tool call sequentially and append tool replies
          for (const call of toolResult.toolCalls) {
            if (call.name === "commit_proposal") {
              didCommitProposalCall = true;
            }

            const executed = await executeToolCall(call, {
              userId,
              conversationId: String(conversationObjectId),
            });
            toolMessages.push({
              role: "tool",
              tool_call_id: executed.id,
              content: executed.content,
            });

            // Extract proposal data from propose_schedule tool
            if (call.name === "propose_schedule") {
              proposalDraft = mergeProposalDraftFromTool(
                proposalDraft,
                call.arguments,
                executed.content,
              );
            }

            // Persist tool exchange for debugging/UI rendering later
            await aiRepository.createMessage({
              conversationId: conversationObjectId,
              userId: userObjectId,
              role: "system",
              content: `[TOOL ${executed.name}] ${executed.content.slice(0, 4000)}`,
              meta: {
                kind: "tool_call",
                toolName: executed.name,
                toolCallId: executed.id,
              } as any,
            });

            if (call.name === "commit_proposal") {
              try {
                const payload = JSON.parse(executed.content);
                commitProposalReply = buildCommitProposalReply(payload);
              } catch {
                commitProposalReply =
                  "Mình vừa chốt lịch nhưng không đọc được kết quả tool. Bạn mở tab Lịch để kiểm tra giúp mình.";
              }
            }
          }

          iter += 1;
          if (iter >= MAX_TOOL_ITERATIONS) break;
        }

        if (
          !didCommitProposalCall &&
          isCommitConfirmationMessage(input.message)
        ) {
          const runForcedCommit = async (): Promise<{
            payload: any;
            executed: { id: string; name: string; content: string };
          }> => {
            const forcedCallId = `force_commit_${Date.now()}`;
            const executed = await executeToolCall(
              {
                id: forcedCallId,
                name: "commit_proposal",
                arguments: "{}",
              },
              {
                userId,
                conversationId: String(conversationObjectId),
              },
            );

            await aiRepository.createMessage({
              conversationId: conversationObjectId,
              userId: userObjectId,
              role: "system",
              content: `[TOOL ${executed.name}] ${executed.content.slice(0, 4000)}`,
              meta: {
                kind: "tool_call",
                toolName: executed.name,
                toolCallId: executed.id,
              } as any,
            });

            let payload: any = null;
            try {
              payload = JSON.parse(executed.content);
            } catch {
              // ignore parse error
            }
            return { payload, executed };
          };

          const first = await runForcedCommit();
          logScheduleDebug("chat.calendar.forced_commit.first", {
            user: shortUser(userId),
            conversationId: String(conversationObjectId),
            error: first.payload?.error,
            ok: first.payload?.ok,
          });

          // If draft missing, the model summarised intake but never invoked
          // propose_schedule. Nudge it ONE more time to call propose_schedule
          // with the collected fields, then auto-commit.
          if (first.payload?.error === "NO_DRAFT") {
            const tryAutoProposeAndCommit = async (): Promise<boolean> => {
              const autoArgs = parseAutoScheduleArgs(input.message);
              if (!autoArgs) return false;

              logScheduleDebug("chat.calendar.auto_propose.args", {
                user: shortUser(userId),
                conversationId: String(conversationObjectId),
                autoArgs,
              });

              const proposeExecuted = await executeToolCall(
                {
                  id: `force_propose_${Date.now()}`,
                  name: "propose_schedule",
                  arguments: JSON.stringify(autoArgs),
                },
                {
                  userId,
                  conversationId: String(conversationObjectId),
                },
              );

              proposalDraft = mergeProposalDraftFromTool(
                proposalDraft,
                JSON.stringify(autoArgs),
                proposeExecuted.content,
              );

              logScheduleDebug("chat.calendar.auto_propose.executed", {
                user: shortUser(userId),
                conversationId: String(conversationObjectId),
                hasDraft: !!proposalDraft,
              });

              await aiRepository.createMessage({
                conversationId: conversationObjectId,
                userId: userObjectId,
                role: "system",
                content: `[TOOL ${proposeExecuted.name}] ${proposeExecuted.content.slice(0, 4000)}`,
                meta: {
                  kind: "tool_call",
                  toolName: proposeExecuted.name,
                  toolCallId: proposeExecuted.id,
                } as any,
              });

              if (!proposalDraft) return false;

              await aiRepository.updateConversationContext({
                conversationId: conversationObjectId,
                userId: userObjectId,
                context: {
                  domain,
                  lastSubtaskKey: currentSubtaskKey,
                  proposalDraft,
                },
              });

              const second = await runForcedCommit();
              forcedCommitReply = buildCommitProposalReply(second.payload);
              logScheduleDebug("chat.calendar.auto_propose.commit", {
                user: shortUser(userId),
                conversationId: String(conversationObjectId),
                error: second.payload?.error,
                ok: second.payload?.ok,
                createdCount: second.payload?.createdCount,
              });
              return true;
            };

            toolMessages.push({
              role: "system",
              content:
                "User vừa xác nhận muốn lên lịch nhưng chưa có proposalDraft. " +
                "Hãy gọi propose_schedule NGAY với các field đã thu thập từ hội thoại " +
                "(activityName hoặc activities[], durationMin, sessionsPerWeek, windowStart, windowEnd, from, to). " +
                "Nếu thiếu field, dùng giả định hợp lý (default: 7 ngày tới, +07:00). " +
                "TUYỆT ĐỐI không trả lời text, phải gọi tool.",
            });

            try {
              const retry = await aiProvider.chatWithTools({
                purpose: "chat",
                messages: toolMessages,
                model: input.model,
                temperature: 0.2,
                maxTokens: input.maxTokens,
                tools: AI_TOOL_DEFINITIONS,
                toolChoice: "auto",
              });

              if (retry.toolCalls && retry.toolCalls.length > 0) {
                logScheduleDebug("chat.calendar.retry.tool_calls", {
                  user: shortUser(userId),
                  conversationId: String(conversationObjectId),
                  count: retry.toolCalls.length,
                  names: retry.toolCalls.map((x) => x.name),
                });
                toolMessages.push({
                  role: "assistant",
                  content: retry.content || "",
                  tool_calls: retry.toolCalls.map((c) => ({
                    id: c.id,
                    type: "function" as const,
                    function: { name: c.name, arguments: c.arguments },
                  })),
                });

                for (const call of retry.toolCalls) {
                  const executed = await executeToolCall(call, {
                    userId,
                    conversationId: String(conversationObjectId),
                  });
                  toolMessages.push({
                    role: "tool",
                    tool_call_id: executed.id,
                    content: executed.content,
                  });

                  if (call.name === "propose_schedule") {
                    proposalDraft = mergeProposalDraftFromTool(
                      proposalDraft,
                      call.arguments,
                      executed.content,
                    );

                    if (proposalDraft) {
                      // Persist draft so commit can read it
                      await aiRepository.updateConversationContext({
                        conversationId: conversationObjectId,
                        userId: userObjectId,
                        context: {
                          domain,
                          lastSubtaskKey: currentSubtaskKey,
                          proposalDraft,
                        },
                      });
                    }
                  }

                  await aiRepository.createMessage({
                    conversationId: conversationObjectId,
                    userId: userObjectId,
                    role: "system",
                    content: `[TOOL ${executed.name}] ${executed.content.slice(0, 4000)}`,
                    meta: {
                      kind: "tool_call",
                      toolName: executed.name,
                      toolCallId: executed.id,
                    } as any,
                  });
                }

                if (proposalDraft) {
                  const second = await runForcedCommit();
                  forcedCommitReply = buildCommitProposalReply(second.payload);
                  logScheduleDebug("chat.calendar.retry.commit", {
                    user: shortUser(userId),
                    conversationId: String(conversationObjectId),
                    error: second.payload?.error,
                    ok: second.payload?.ok,
                    createdCount: second.payload?.createdCount,
                  });
                } else {
                  const didAutoCommit = await tryAutoProposeAndCommit();
                  if (!didAutoCommit) {
                    logScheduleDebug(
                      "chat.calendar.retry.no_draft_after_tools",
                      {
                        user: shortUser(userId),
                        conversationId: String(conversationObjectId),
                      },
                    );
                    forcedCommitReply =
                      "Mình cần thêm thông tin để đề xuất lịch (hoạt động, thời lượng/buổi, số buổi/tuần, khung giờ). Bạn cho mình biết các thông tin đó nhé.";
                  }
                }
              } else {
                const didAutoCommit = await tryAutoProposeAndCommit();
                if (!didAutoCommit) {
                  logScheduleDebug("chat.calendar.retry.no_tool_calls", {
                    user: shortUser(userId),
                    conversationId: String(conversationObjectId),
                  });
                  forcedCommitReply =
                    "Mình cần thêm thông tin để đề xuất lịch (hoạt động, thời lượng/buổi, số buổi/tuần, khung giờ). Bạn cho mình biết các thông tin đó nhé.";
                }
              }
            } catch {
              forcedCommitReply = buildCommitProposalReply(first.payload);
            }
          } else {
            forcedCommitReply = buildCommitProposalReply(first.payload);
          }
        }

        // Save proposal draft to conversation context
        if (proposalDraft) {
          await aiRepository.updateConversationContext({
            conversationId: conversationObjectId,
            userId: userObjectId,
            context: {
              domain,
              lastSubtaskKey: currentSubtaskKey,
              proposalDraft,
            },
          });
        }

        result = {
          content:
            commitProposalReply ??
            forcedCommitReply ??
            (shouldShowCalendarOnboarding
              ? `${CALENDAR_ONBOARDING_GUIDE}\n\n${toolResult.content}`
              : toolResult.content),
          model: toolResult.model,
          usage: toolResult.usage,
        };
      } // end if (!fastPathHandled)
    } else {
      result = await aiProvider.chat({
        purpose: "chat",
        messages: baseMessages,
        model: input.model,
        temperature:
          intent === "EXERCISE" || intent === "CHECK_ANSWER" ? 0.2 : 0.4,
        maxTokens: input.maxTokens,
      });
    }

    const finalAssistantContent = ensureAssistantContent(result.content);
    await aiRepository.createMessage({
      conversationId: conversationObjectId,
      userId: userObjectId,
      role: "assistant",
      content: finalAssistantContent,
      tokens: result.usage?.totalTokens,
      meta: currentSubtaskKey
        ? {
            kind: "chat",
            subtaskKey: currentSubtaskKey,
            subtaskTitle: input.subtaskContext?.subtaskTitle,
            subtaskIndex: input.subtaskContext?.subtaskIndex,
          }
        : undefined,
    });

    await aiRepository.touchConversationUpdatedAt({
      conversationId: conversationObjectId,
      userId: userObjectId,
    });

    // Update conversation's lastSubtaskKey + domain
    await aiRepository.updateConversationContext({
      conversationId: conversationObjectId,
      userId: userObjectId,
      lastSubtaskKey: currentSubtaskKey,
      domain,
    });

    // Fire-and-forget memory extraction from the user utterance
    void userMemoryService.ingestUtterance(userObjectId, input.message);

    return {
      reply: finalAssistantContent,
      conversationId: String(conversationObjectId),
      model: result.model,
      usage: result.usage,
      ...(tasksCreatedCount > 0 ? { tasksCreated: tasksCreatedCount } : {}),
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

    yield { type: "meta", conversationId: String(conversationObjectId) };

    const stream = aiProvider.chatStream({
      purpose: "chat",
      messages: [
        {
          role: "system",
          content:
            "Bạn là trợ lý AI cho ứng dụng quản lý công việc. Luôn trả lời ngắn gọn, bám đúng câu hỏi, đề xuất bước hành động cụ thể khi phù hợp. Không bịa thông tin, không tự mở rộng ngoài phạm vi câu hỏi. Trả lời bằng tiếng Việt trừ khi người dùng viết bằng ngôn ngữ khác.",
        },
        { role: "user", content: input.message },
      ],
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    });

    let assistantText = "";
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
      messages: messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map(toPublicMessage),
    };
  },

  getOrCreateConversationByParentTask: async (
    userId: string,
    input: { parentTaskId: string; title?: string },
  ): Promise<{
    conversation: PublicAiConversation;
    messages: PublicAiMessage[];
    created: boolean;
  }> => {
    if (!Types.ObjectId.isValid(userId)) throw new Error("USER_ID_INVALID");
    if (!Types.ObjectId.isValid(input.parentTaskId))
      throw new Error("PARENT_TASK_ID_INVALID");

    const userObjectId = new Types.ObjectId(userId);
    const parentTaskObjectId = new Types.ObjectId(input.parentTaskId);
    const { doc, created } =
      await aiRepository.findOrCreateConversationForParentTask({
        userId: userObjectId,
        parentTaskId: parentTaskObjectId,
        title: (input.title || "").slice(0, 80) || "Task conversation",
      });

    const messages = await aiRepository.listMessagesByConversation({
      conversationId: doc._id,
      userId: userObjectId,
      limit: 100,
    });

    return {
      conversation: toPublicConversation(doc),
      messages: messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map(toPublicMessage),
      created,
    };
  },
};
