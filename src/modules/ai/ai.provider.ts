import { GoogleGenerativeAI } from "@google/generative-ai";

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
    const apiKey =
      process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "";
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY_MISSING");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    });

    const result = await model.generateContent(input.prompt);
    const content = result.response.text();

    return { content };
  },
};
