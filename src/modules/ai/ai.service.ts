import { aiPromptService } from "./ai.prompt.service";
import { aiProvider } from "./ai.provider";

export const aiService = {
  chat: async (
    _userId: string,
    input: { message: string },
  ): Promise<{ reply: string }> => {
    const prompt = aiPromptService.buildChatPrompt({ message: input.message });
    const result = await aiProvider.chat({ prompt });
    return { reply: result.content };
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
