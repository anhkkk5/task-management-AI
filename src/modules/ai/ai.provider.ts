export type AiChatInput = {
  prompt: string;
};

export type AiChatResult = {
  content: string;
};

export type AiProvider = {
  chat: (input: AiChatInput) => Promise<AiChatResult>;
};

export const aiProvider: AiProvider = {
  chat: async () => {
    throw new Error("AI_PROVIDER_NOT_CONFIGURED");
  },
};
