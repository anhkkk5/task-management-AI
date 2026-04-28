/**
 * ai-chat-calendar.ts
 * --------------------
 * Calendar-specific scheduling logic extracted from ai-chat.service.ts.
 * Contains the fast-path (one-shot propose→commit), the model tool-calling
 * loop, and the forced-commit fallback flow.
 *
 * Designed to be called from `aiChatService.chat()` when intent === CALENDAR_QUERY.
 */

import { Types } from "mongoose";
import { aiProvider, AiChatMessage } from "./ai.provider";
import { aiRepository } from "./ai.repository";
import { AI_TOOL_DEFINITIONS, executeToolCall } from "./ai-tools";
import { mergeProposalDraftFromTool } from "./ai-chat-draft";
import {
  logScheduleDebug,
  shortUser,
  isDetailedSchedulingRequest,
  isCommitConfirmationMessage,
  parseAutoScheduleArgs,
  buildCommitProposalReply,
  CALENDAR_ONBOARDING_GUIDE,
  type ChatInput,
} from "./ai-chat-helpers";
import type { ProposalDraft } from "./ai-conversation.model";

// ─── Shared context passed from the orchestrator ─────────────────────────────

export type CalendarContext = {
  userId: string;
  userObjectId: Types.ObjectId;
  conversationObjectId: Types.ObjectId;
  domain: string | undefined;
  currentSubtaskKey?: string;
  input: ChatInput;
  baseMessages: AiChatMessage[];
  historyForAILength: number;
};

// ─── Return value ────────────────────────────────────────────────────────────

export type CalendarResult = {
  content: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  tasksCreatedCount: number;
};

// ─── Persist a tool exchange as a system message ─────────────────────────────

async function persistToolMessage(
  conversationId: Types.ObjectId,
  userId: Types.ObjectId,
  executed: { id: string; name: string; content: string },
): Promise<void> {
  await aiRepository.createMessage({
    conversationId,
    userId,
    role: "system",
    content: `[TOOL ${executed.name}] ${executed.content.slice(0, 4000)}`,
    meta: {
      kind: "tool_call",
      toolName: executed.name,
      toolCallId: executed.id,
    } as any,
  });
}

// ─── Save draft to conversation context ──────────────────────────────────────

async function saveDraftToContext(
  ctx: CalendarContext,
  proposalDraft: ProposalDraft,
): Promise<void> {
  await aiRepository.updateConversationContext({
    conversationId: ctx.conversationObjectId,
    userId: ctx.userObjectId,
    context: {
      domain: ctx.domain,
      lastSubtaskKey: ctx.currentSubtaskKey,
      proposalDraft,
    },
  });
}

// ─── FAST PATH: one-shot propose → commit ────────────────────────────────────

async function runFastPath(
  ctx: CalendarContext,
): Promise<CalendarResult | null> {
  const autoArgs = parseAutoScheduleArgs(ctx.input.message);
  if (!autoArgs) return null;

  logScheduleDebug("chat.calendar.fast_path.start", {
    user: shortUser(ctx.userId),
    conversationId: String(ctx.conversationObjectId),
    autoArgs,
  });

  // 1) propose_schedule
  const proposeExec = await executeToolCall(
    {
      id: `fast_propose_${Date.now()}`,
      name: "propose_schedule",
      arguments: JSON.stringify(autoArgs),
    },
    { userId: ctx.userId, conversationId: String(ctx.conversationObjectId) },
  );

  await persistToolMessage(
    ctx.conversationObjectId,
    ctx.userObjectId,
    proposeExec,
  );

  const fastDraft = mergeProposalDraftFromTool(
    undefined,
    JSON.stringify(autoArgs),
    proposeExec.content,
  );

  if (!fastDraft) {
    logScheduleDebug("chat.calendar.fast_path.no_draft", {
      user: shortUser(ctx.userId),
      conversationId: String(ctx.conversationObjectId),
      reason: "propose returned 0 viable sessions",
    });
    return null; // fall through to model tool loop
  }

  // 2) Save draft
  await saveDraftToContext(ctx, fastDraft);

  // 3) commit_proposal
  const commitExec = await executeToolCall(
    {
      id: `fast_commit_${Date.now()}`,
      name: "commit_proposal",
      arguments: "{}",
    },
    { userId: ctx.userId, conversationId: String(ctx.conversationObjectId) },
  );

  await persistToolMessage(
    ctx.conversationObjectId,
    ctx.userObjectId,
    commitExec,
  );

  let commitPayload: any = null;
  try {
    commitPayload = JSON.parse(commitExec.content);
  } catch {
    /* ignore */
  }

  // 4) Build reply including unmet-sessions info
  let replyText = buildCommitProposalReply(commitPayload);

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

  const tasksCreatedCount = Number(commitPayload?.createdCount || 0);

  logScheduleDebug("chat.calendar.fast_path.done", {
    user: shortUser(ctx.userId),
    conversationId: String(ctx.conversationObjectId),
    ok: commitPayload?.ok,
    createdCount: tasksCreatedCount,
  });

  return {
    content: replyText,
    model: undefined,
    usage: undefined,
    tasksCreatedCount,
  };
}

// ─── MODEL TOOL LOOP ─────────────────────────────────────────────────────────

async function runModelToolLoop(ctx: CalendarContext): Promise<CalendarResult> {
  const toolMessages: AiChatMessage[] = [...ctx.baseMessages];
  const MAX_TOOL_ITERATIONS = 3;
  let iter = 0;
  let toolResult: Awaited<ReturnType<typeof aiProvider.chatWithTools>>;
  let proposalDraft: ProposalDraft | undefined = undefined;
  let didCommitProposalCall = false;
  let commitProposalReply: string | undefined = undefined;
  let forcedCommitReply: string | undefined = undefined;
  const shouldShowCalendarOnboarding = ctx.historyForAILength === 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    toolResult = await aiProvider.chatWithTools({
      purpose: "chat",
      messages: toolMessages,
      model: ctx.input.model,
      temperature: 0.2,
      maxTokens: ctx.input.maxTokens,
      tools: AI_TOOL_DEFINITIONS,
      toolChoice: "auto",
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
        userId: ctx.userId,
        conversationId: String(ctx.conversationObjectId),
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

      await persistToolMessage(
        ctx.conversationObjectId,
        ctx.userObjectId,
        executed,
      );

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

  // Force summary if model never produced final text
  if (
    (!toolResult.content || toolResult.content.trim().length === 0) &&
    toolMessages.some((m) => m.role === "tool")
  ) {
    logScheduleDebug("chat.calendar.tool_loop.force_summary", {
      user: shortUser(ctx.userId),
      conversationId: String(ctx.conversationObjectId),
      iter,
    });
    try {
      const summary = await aiProvider.chat({
        purpose: "chat",
        messages: toolMessages,
        model: ctx.input.model,
        temperature: 0.3,
        maxTokens: ctx.input.maxTokens,
      });
      if (summary.content && summary.content.trim().length > 0) {
        toolResult = {
          ...toolResult,
          content: summary.content,
          model: summary.model ?? toolResult.model,
          usage: summary.usage ?? toolResult.usage,
        };
      }
    } catch (err) {
      logScheduleDebug("chat.calendar.tool_loop.force_summary_error", {
        user: shortUser(ctx.userId),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Forced commit when user confirmed but model didn't call commit_proposal
  if (
    !didCommitProposalCall &&
    isCommitConfirmationMessage(ctx.input.message)
  ) {
    forcedCommitReply = await runForcedCommitFlow(
      ctx,
      toolMessages,
      proposalDraft,
      (draft) => {
        proposalDraft = draft;
      },
    );
  }

  // Save proposal draft to conversation context
  if (proposalDraft) {
    await saveDraftToContext(ctx, proposalDraft);
  }

  const content =
    commitProposalReply ??
    forcedCommitReply ??
    (shouldShowCalendarOnboarding
      ? `${CALENDAR_ONBOARDING_GUIDE}\n\n${toolResult.content}`
      : toolResult.content);

  return {
    content,
    model: toolResult.model,
    usage: toolResult.usage,
    tasksCreatedCount: 0, // tool-loop commit counts are in the reply text
  };
}

// ─── Forced commit flow (confirmation without model calling commit) ──────────

async function runForcedCommitFlow(
  ctx: CalendarContext,
  toolMessages: AiChatMessage[],
  proposalDraft: ProposalDraft | undefined,
  setDraft: (draft: ProposalDraft | undefined) => void,
): Promise<string | undefined> {
  const runForcedCommit = async (): Promise<{
    payload: any;
    executed: { id: string; name: string; content: string };
  }> => {
    const forcedCallId = `force_commit_${Date.now()}`;
    const executed = await executeToolCall(
      { id: forcedCallId, name: "commit_proposal", arguments: "{}" },
      { userId: ctx.userId, conversationId: String(ctx.conversationObjectId) },
    );

    await persistToolMessage(
      ctx.conversationObjectId,
      ctx.userObjectId,
      executed,
    );

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
    user: shortUser(ctx.userId),
    conversationId: String(ctx.conversationObjectId),
    error: first.payload?.error,
    ok: first.payload?.ok,
  });

  if (first.payload?.error !== "NO_DRAFT") {
    return buildCommitProposalReply(first.payload);
  }

  // Draft missing — try auto-propose then commit
  const tryAutoProposeAndCommit = async (): Promise<boolean> => {
    const autoArgs = parseAutoScheduleArgs(ctx.input.message);
    if (!autoArgs) return false;

    logScheduleDebug("chat.calendar.auto_propose.args", {
      user: shortUser(ctx.userId),
      conversationId: String(ctx.conversationObjectId),
      autoArgs,
    });

    const proposeExecuted = await executeToolCall(
      {
        id: `force_propose_${Date.now()}`,
        name: "propose_schedule",
        arguments: JSON.stringify(autoArgs),
      },
      { userId: ctx.userId, conversationId: String(ctx.conversationObjectId) },
    );

    const merged = mergeProposalDraftFromTool(
      proposalDraft,
      JSON.stringify(autoArgs),
      proposeExecuted.content,
    );
    setDraft(merged);

    logScheduleDebug("chat.calendar.auto_propose.executed", {
      user: shortUser(ctx.userId),
      conversationId: String(ctx.conversationObjectId),
      hasDraft: !!merged,
    });

    await persistToolMessage(
      ctx.conversationObjectId,
      ctx.userObjectId,
      proposeExecuted,
    );

    if (!merged) return false;

    await saveDraftToContext(ctx, merged);

    const second = await runForcedCommit();
    logScheduleDebug("chat.calendar.auto_propose.commit", {
      user: shortUser(ctx.userId),
      conversationId: String(ctx.conversationObjectId),
      error: second.payload?.error,
      ok: second.payload?.ok,
      createdCount: second.payload?.createdCount,
    });
    return true;
  };

  // Nudge the model to call propose_schedule with collected fields
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
      model: ctx.input.model,
      temperature: 0.2,
      maxTokens: ctx.input.maxTokens,
      tools: AI_TOOL_DEFINITIONS,
      toolChoice: "auto",
    });

    if (retry.toolCalls && retry.toolCalls.length > 0) {
      logScheduleDebug("chat.calendar.retry.tool_calls", {
        user: shortUser(ctx.userId),
        conversationId: String(ctx.conversationObjectId),
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
          userId: ctx.userId,
          conversationId: String(ctx.conversationObjectId),
        });
        toolMessages.push({
          role: "tool",
          tool_call_id: executed.id,
          content: executed.content,
        });

        if (call.name === "propose_schedule") {
          const merged = mergeProposalDraftFromTool(
            proposalDraft,
            call.arguments,
            executed.content,
          );
          setDraft(merged);
          proposalDraft = merged;

          if (merged) {
            await saveDraftToContext(ctx, merged);
          }
        }

        await persistToolMessage(
          ctx.conversationObjectId,
          ctx.userObjectId,
          executed,
        );
      }

      if (proposalDraft) {
        const second = await runForcedCommit();
        logScheduleDebug("chat.calendar.retry.commit", {
          user: shortUser(ctx.userId),
          conversationId: String(ctx.conversationObjectId),
          error: second.payload?.error,
          ok: second.payload?.ok,
          createdCount: second.payload?.createdCount,
        });
        return buildCommitProposalReply(second.payload);
      } else {
        const didAutoCommit = await tryAutoProposeAndCommit();
        if (!didAutoCommit) {
          logScheduleDebug("chat.calendar.retry.no_draft_after_tools", {
            user: shortUser(ctx.userId),
            conversationId: String(ctx.conversationObjectId),
          });
          return "Mình cần thêm thông tin để đề xuất lịch (hoạt động, thời lượng/buổi, số buổi/tuần, khung giờ). Bạn cho mình biết các thông tin đó nhé.";
        }
      }
    } else {
      const didAutoCommit = await tryAutoProposeAndCommit();
      if (!didAutoCommit) {
        logScheduleDebug("chat.calendar.retry.no_tool_calls", {
          user: shortUser(ctx.userId),
          conversationId: String(ctx.conversationObjectId),
        });
        return "Mình cần thêm thông tin để đề xuất lịch (hoạt động, thời lượng/buổi, số buổi/tuần, khung giờ). Bạn cho mình biết các thông tin đó nhé.";
      }
    }
  } catch {
    return buildCommitProposalReply(first.payload);
  }

  return undefined;
}

// ─── Main entry point for calendar intent handling ───────────────────────────

export async function handleCalendarIntent(
  ctx: CalendarContext,
): Promise<CalendarResult> {
  const isNewDetailedSchedule = isDetailedSchedulingRequest(ctx.input.message);

  logScheduleDebug("chat.calendar.entry", {
    user: shortUser(ctx.userId),
    conversationId: String(ctx.conversationObjectId),
    isNewDetailedSchedule,
  });

  // Clear stale draft when user provides a full new scheduling command
  if (isNewDetailedSchedule) {
    await aiRepository.updateConversationContext({
      conversationId: ctx.conversationObjectId,
      userId: ctx.userObjectId,
      context: {
        domain: ctx.domain,
        lastSubtaskKey: ctx.currentSubtaskKey,
        proposalDraft: undefined,
      },
    });
    logScheduleDebug("chat.calendar.clear_stale_draft", {
      user: shortUser(ctx.userId),
      conversationId: String(ctx.conversationObjectId),
    });
  }

  // ── Try fast path first (one-shot detailed scheduling)
  if (isNewDetailedSchedule) {
    try {
      const fastResult = await runFastPath(ctx);
      if (fastResult) return fastResult;
    } catch (err) {
      logScheduleDebug("chat.calendar.fast_path.error", {
        user: shortUser(ctx.userId),
        conversationId: String(ctx.conversationObjectId),
        message: err instanceof Error ? err.message : String(err),
      });
      // Fall through to model tool loop
    }
  }

  // ── Model tool loop (fallback)
  return runModelToolLoop(ctx);
}
