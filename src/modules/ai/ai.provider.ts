import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

export type AiChatStreamChunk = {
  type: "delta";
  delta: string;
};

export type AiChatStreamMeta = {
  type: "meta";
  conversationId: string;
};

export type AiChatStreamDone = {
  type: "done";
  model?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export type AiChatStreamEvent =
  | AiChatStreamMeta
  | AiChatStreamChunk
  | AiChatStreamDone;

export type AiProvider = {
  chat: (input: AiChatInput) => Promise<AiChatResult>;
  chatStream: (input: AiChatInput) => AsyncGenerator<AiChatStreamEvent>;
};

const groqChat = async (input: AiChatInput): Promise<AiChatResult> => {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) throw new Error("GROQ_API_KEY_MISSING");

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  });

  const model = (input.model || process.env.GROQ_MODEL || "llama-3.1-8b-instant").trim();

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
      usage: response.usage ? {
        promptTokens: (response.usage as any).prompt_tokens,
        completionTokens: (response.usage as any).completion_tokens,
        totalTokens: (response.usage as any).total_tokens,
      } : undefined,
    };
  } catch (err: any) {
    if (err?.status === 429) throw new Error("GROQ_RATE_LIMIT");
    if (err?.status === 401 || err?.status === 403) throw new Error("GROQ_UNAUTHORIZED");
    throw err;
  }
};

const groqChatStream = async function* (input: AiChatInput): AsyncGenerator<AiChatStreamEvent> {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) throw new Error("GROQ_API_KEY_MISSING");

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
  });

  const model = (input.model || process.env.GROQ_MODEL || "llama-3.1-8b-instant").trim();

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: input.messages,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      stream: true,
    });

    for await (const chunk of stream as any) {
      const delta = chunk?.choices?.[0]?.delta?.content !== undefined
        ? String(chunk.choices[0].delta.content)
        : "";
      if (delta) yield { type: "delta", delta };
    }
    yield { type: "done", model };
  } catch (err: any) {
    if (err?.status === 429) throw new Error("GROQ_RATE_LIMIT");
    if (err?.status === 401 || err?.status === 403) throw new Error("GROQ_UNAUTHORIZED");
    throw err;
  }
};

const geminiChat = async (input: AiChatInput): Promise<AiChatResult> => {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING");

  const genAI = new GoogleGenerativeAI(apiKey);
  let systemInstruction = "";
  const filteredMessages = input.messages.filter((m) => {
    if (m.role === "system") {
      systemInstruction += m.content + "\n";
      return false;
    }
    return true;
  });

  const model = genAI.getGenerativeModel({
    model: input.model || "gemini-1.5-flash",
    ...(systemInstruction && { systemInstruction })
  });
  
  const history = filteredMessages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  
  const msg = filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1].content : "";
  const chat = model.startChat({ history });

  const result = await chat.sendMessage(msg);
  return {
    content: result.response.text(),
    model: input.model || "gemini-1.5-flash",
  };
};

const geminiChatStream = async function* (input: AiChatInput): AsyncGenerator<AiChatStreamEvent> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING");

  const genAI = new GoogleGenerativeAI(apiKey);
  let systemInstruction = "";
  const filteredMessages = input.messages.filter((m) => {
    if (m.role === "system") {
      systemInstruction += m.content + "\n";
      return false;
    }
    return true;
  });

  const model = genAI.getGenerativeModel({
    model: input.model || "gemini-1.5-flash",
    ...(systemInstruction && { systemInstruction })
  });

  const history = filteredMessages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  const msg = filteredMessages.length > 0 ? filteredMessages[filteredMessages.length - 1].content : "";
  const chat = model.startChat({ history });

  const result = await chat.sendMessageStream(msg);
  for await (const chunk of result.stream) {
    if (chunk.text()) {
      yield { type: "delta", delta: chunk.text() };
    }
  }
  yield { type: "done", model: input.model || "gemini-1.5-flash" };
};

export const aiProvider: AiProvider = {
  chat: async (input) => {
    const provider = process.env.AI_PROVIDER || "groq";
    if (provider === "gemini") return geminiChat(input);
    return groqChat(input);
  },
  chatStream: async function* (input) {
    const provider = process.env.AI_PROVIDER || "groq";
    if (provider === "gemini") {
      yield* geminiChatStream(input);
      return;
    }
    yield* groqChatStream(input);
  }
};
