import { Types } from "mongoose";
import { aiProvider, AiChatStreamEvent } from "./ai.provider";
import { aiRepository } from "./ai.repository";
import {
  PublicAiConversation,
  PublicAiMessage,
  toPublicConversation,
  toPublicMessage,
} from "./ai.mapper";

export const aiService = {
  chat: async (
    userId: string,
    input: {
      message: string;
      conversationId?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    },
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
    const userObjectId = new Types.ObjectId(userId);
    const title = input.message.slice(0, 60);

    const conversationObjectId = input.conversationId
      ? new Types.ObjectId(input.conversationId)
      : (
          await aiRepository.createConversation({
            userId: userObjectId,
            title,
          })
        )._id;

    // ensure ownership if conversationId is provided
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

    const result = await aiProvider.chat({
      messages: [
        {
          role: "system",
          content: "You are a productivity assistant. Reply in Vietnamese.",
        },
        {
          role: "user",
          content: input.message,
        },
      ],
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    });

    await aiRepository.createMessage({
      conversationId: conversationObjectId,
      userId: userObjectId,
      role: "assistant",
      content: result.content,
      tokens: result.usage?.totalTokens,
    });
    await aiRepository.touchConversationUpdatedAt({
      conversationId: conversationObjectId,
      userId: userObjectId,
    });

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
    const userObjectId = new Types.ObjectId(userId);
    const title = input.message.slice(0, 60);

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

    // First event: provide conversationId so client can persist it
    yield { type: "meta", conversationId: String(conversationObjectId) };

    const stream = aiProvider.chatStream({
      messages: [
        {
          role: "system",
          content: "You are a productivity assistant. Reply in Vietnamese.",
        },
        {
          role: "user",
          content: input.message,
        },
      ],
      model: input.model,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
    });

    let assistantText = "";
    let finalModel: string | undefined;
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

      finalModel = ev.model;
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

  taskBreakdown: async (
    _userId: string,
    _input: { title: string; deadline?: Date },
  ): Promise<{ steps: { title: string; status: string }[] }> => {
    throw new Error("NOT_IMPLEMENTED");
  },

  prioritySuggest: async (
    _userId: string,
    _input: { title: string; deadline?: Date },
  ): Promise<{ priority: string; reason?: string }> => {
    throw new Error("NOT_IMPLEMENTED");
  },

  schedulePlan: async (
    _userId: string,
    _input: { goal: string; days?: number },
  ): Promise<{ plan: string }> => {
    throw new Error("NOT_IMPLEMENTED");
  },
};
