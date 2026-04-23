import { Types } from "mongoose";
import { aiProvider, AiChatStreamEvent } from "./ai.provider";
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

    const {
      id: conversationObjectId,
      lastSubtaskKey,
    } = await resolveConversation(userObjectId, input);

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
    const historyForAI = historyMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role:
          m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      }));

    const fewShot =
      historyForAI.length === 0 && input.fewShotMessages?.length
        ? input.fewShotMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          }))
        : [];

    const result = await aiProvider.chat({
      purpose: "chat",
      messages: [
        { role: "system", content: systemContent },
        ...fewShot,
        ...historyForAI,
        { role: "user", content: input.message },
      ],
      model: input.model,
      temperature:
        intent === "EXERCISE" || intent === "CHECK_ANSWER" ? 0.2 : 0.4,
      maxTokens: input.maxTokens,
    });

    await aiRepository.createMessage({
      conversationId: conversationObjectId,
      userId: userObjectId,
      role: "assistant",
      content: result.content,
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
      reply: result.content,
      conversationId: String(conversationObjectId),
      model: result.model,
      usage: result.usage,
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
      messages: messages.map(toPublicMessage),
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
      messages: messages.map(toPublicMessage),
      created,
    };
  },
};
