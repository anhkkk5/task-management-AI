import OpenAI from "openai";

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiChatInput = {
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

export type AiChatResult = {
  content: string;
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export type AiProvider = {
  chat: (input: AiChatInput) => Promise<AiChatResult>;
};

export const aiProvider: AiProvider = {
  chat: async (input) => {
    const apiKey = process.env.GROQ_API_KEY || "";
    if (!apiKey) {
      throw new Error("GROQ_API_KEY_MISSING");
    }

    const client = new OpenAI({
      apiKey,
      baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    });

    const model = (
      input.model ||
      process.env.GROQ_MODEL ||
      "llama-3.1-8b-instant"
    ).trim();

    try {
      const response = await client.chat.completions.create({
        model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
      });

      const content = response.choices?.[0]?.message?.content ?? "";
      return {
        content,
        model: response.model,
        usage: response.usage
          ? {
              promptTokens: (response.usage as any).prompt_tokens,
              completionTokens: (response.usage as any).completion_tokens,
              totalTokens: (response.usage as any).total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      const anyErr = err as any;
      const status = anyErr?.status;
      if (status === 429) {
        throw new Error("GROQ_RATE_LIMIT");
      }
      if (status === 401 || status === 403) {
        throw new Error("GROQ_UNAUTHORIZED");
      }
      throw err;
    }
  },
};
