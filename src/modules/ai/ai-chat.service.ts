/**
 * ai-chat.service.ts
 * -------------------
 * Thin orchestrator for the AI chat feature. Heavy logic has been extracted:
 *   - ai-chat-helpers.ts  → types, pure functions, debug logging
 *   - ai-chat-draft.ts    → proposal-draft merging
 *   - ai-chat-calendar.ts → fast-path, model tool-loop, forced-commit
 *
 * This file wires together context loading, intent detection, prompt
 * building, and delegates to the appropriate handler.
 */

import { Types } from "mongoose";
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
import {
  logScheduleDebug,
  shortUser,
  isCommitConfirmationMessage,
  ensureAssistantContent,
  FALLBACK_ASSISTANT_REPLY,
  resolveConversation,
  type ChatInput,
} from "./ai-chat-helpers";
import { handleCalendarIntent } from "./ai-chat-calendar";

export const aiChatService = {
  /**
   * Main non-streaming chat endpoint.
   * Detects intent → builds prompt → delegates to calendar handler or plain LLM.
   */
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

    // ── Load conversation history ────────────────────────────────────
    const historyMessages = await aiRepository.listMessagesByConversation({
      conversationId: conversationObjectId,
      userId: userObjectId,
      limit: 40,
    });

    // ── Detect subtask transition ────────────────────────────────────
    const currentSubtaskKey = input.subtaskContext?.subtaskKey;
    const isSubtaskTransition =
      !!currentSubtaskKey &&
      !!lastSubtaskKey &&
      currentSubtaskKey !== lastSubtaskKey;

    if (isSubtaskTransition && input.subtaskContext?.subtaskTitle) {
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

    // ── Save user message ────────────────────────────────────────────
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

    // ── Intent detection + override for pending draft ────────────────
    let intent = detectIntent(input.message);
    const userLang = detectUserLanguage(input.message);
    const targetLang = resolveTargetLanguage(input.subtaskContext);

    if (
      intent !== "CALENDAR_QUERY" &&
      isCommitConfirmationMessage(input.message)
    ) {
      try {
        const convDoc = await aiRepository.findConversationByIdForUser({
          conversationId: conversationObjectId,
          userId: userObjectId,
        });
        const pendingDraft = (convDoc as any)?.context?.proposalDraft;
        const hasPendingDraft =
          !!pendingDraft &&
          (Array.isArray(pendingDraft.items)
            ? pendingDraft.items.length > 0
            : Array.isArray(pendingDraft.sessions) &&
              pendingDraft.sessions.length > 0);
        if (hasPendingDraft) {
          logScheduleDebug("chat.intent.override_to_calendar", {
            user: shortUser(userId),
            conversationId: String(conversationObjectId),
            originalIntent: intent,
            reason: "commit_confirmation_with_pending_draft",
          });
          intent = "CALENDAR_QUERY";
        }
      } catch (err) {
        logScheduleDebug("chat.intent.override_check_error", {
          user: shortUser(userId),
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Build system prompt ──────────────────────────────────────────
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

    // ── Prepare LLM messages ─────────────────────────────────────────
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

    const baseMessages: AiChatMessage[] = [
      { role: "system", content: systemContent },
      ...fewShot.map(
        (m) => ({ role: m.role, content: m.content }) as AiChatMessage,
      ),
      ...historyForAI.map(
        (m) => ({ role: m.role, content: m.content }) as AiChatMessage,
      ),
      { role: "user", content: input.message },
    ];

    // ── Dispatch to handler ──────────────────────────────────────────
    let result: { content: string; model?: string; usage?: any } = {
      content: FALLBACK_ASSISTANT_REPLY,
      model: undefined,
      usage: undefined,
    };
    let tasksCreatedCount = 0;

    if (intent === "CALENDAR_QUERY") {
      const calResult = await handleCalendarIntent({
        userId,
        userObjectId,
        conversationObjectId,
        domain,
        currentSubtaskKey,
        input,
        baseMessages,
        historyForAILength: historyForAI.length,
      });
      result = {
        content: calResult.content,
        model: calResult.model,
        usage: calResult.usage,
      };
      tasksCreatedCount = calResult.tasksCreatedCount;
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

    // ── Persist assistant reply ──────────────────────────────────────
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

    await aiRepository.updateConversationContext({
      conversationId: conversationObjectId,
      userId: userObjectId,
      lastSubtaskKey: currentSubtaskKey,
      domain,
    });

    void userMemoryService.ingestUtterance(userObjectId, input.message);

    return {
      reply: finalAssistantContent,
      conversationId: String(conversationObjectId),
      model: result.model,
      usage: result.usage,
      ...(tasksCreatedCount > 0 ? { tasksCreated: tasksCreatedCount } : {}),
    };
  },

  /**
   * Streaming chat endpoint (simplified — no tool calling).
   */
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
