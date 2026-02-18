import OpenAI from "openai";

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
  chat: async (input) => {
    const apiKey = process.env.GROQ_API_KEY || "";
    if (!apiKey) {
      throw new Error("GROQ_API_KEY_MISSING");
    }

    const client = new OpenAI({
      apiKey,
      baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    });

    const model = (process.env.GROQ_MODEL || "llama-3.1-8b-instant").trim();

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: input.prompt,
          },
        ],
      });

      const content = response.choices?.[0]?.message?.content ?? "";
      return { content };
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
