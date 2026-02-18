import { aiProvider, AiChatStreamEvent } from "./ai.provider";

export const aiService = {
  chat: async (
    _userId: string,
    input: {
      message: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<{
    reply: string;
    model?: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  }> => {
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

    return {
      reply: result.content,
      model: result.model,
      usage: result.usage,
    };
  },

  chatStream: async function* (
    _userId: string,
    input: {
      message: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): AsyncGenerator<AiChatStreamEvent> {
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

    for await (const ev of stream) {
      yield ev;
    }
  },

  listConversations: async (
    _userId: string,
  ): Promise<{ conversations: any[] }> => {
    throw new Error("NOT_IMPLEMENTED");
  },

  getConversationById: async (
    _userId: string,
    _input: { id: string },
  ): Promise<{ conversation: any; messages: any[] }> => {
    throw new Error("NOT_IMPLEMENTED");
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
