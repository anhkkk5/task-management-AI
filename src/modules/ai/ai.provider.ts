import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiChatPurpose = "chat" | "breakdown" | "schedule" | "generic";

export type AiChatInput = {
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Logical purpose of this call, used to route to the best provider:
   * - "chat": realtime chat → prefers Groq (fast)
   * - "breakdown": task planning/reasoning → prefers Gemini (smarter)
   * - "schedule"/"generic": default routing
   */
  purpose?: AiChatPurpose;
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
  } catch (err: any) {
    if (err?.status === 429) throw new Error("GROQ_RATE_LIMIT");
    if (err?.status === 401 || err?.status === 403)
      throw new Error("GROQ_UNAUTHORIZED");
    throw err;
  }
};

const groqChatStream = async function* (
  input: AiChatInput,
): AsyncGenerator<AiChatStreamEvent> {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) throw new Error("GROQ_API_KEY_MISSING");

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
    const stream = await client.chat.completions.create({
      model,
      messages: input.messages,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      stream: true,
    });

    for await (const chunk of stream as any) {
      const delta =
        chunk?.choices?.[0]?.delta?.content !== undefined
          ? String(chunk.choices[0].delta.content)
          : "";
      if (delta) yield { type: "delta", delta };
    }
    yield { type: "done", model };
  } catch (err: any) {
    if (err?.status === 429) throw new Error("GROQ_RATE_LIMIT");
    if (err?.status === 401 || err?.status === 403)
      throw new Error("GROQ_UNAUTHORIZED");
    throw err;
  }
};

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

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

  const modelName =
    input.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(systemInstruction && { systemInstruction }),
    generationConfig: {
      ...(input.temperature !== undefined && {
        temperature: input.temperature,
      }),
      ...(input.maxTokens !== undefined && {
        maxOutputTokens: input.maxTokens,
      }),
    },
  });

  const history = filteredMessages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const msg =
    filteredMessages.length > 0
      ? filteredMessages[filteredMessages.length - 1].content
      : "";
  const chat = model.startChat({ history });

  try {
    const result = await chat.sendMessage(msg);
    return {
      content: result.response.text(),
      model: modelName,
    };
  } catch (err: any) {
    const status = err?.status ?? err?.response?.status;
    if (status === 429) throw new Error("GEMINI_RATE_LIMIT");
    if (status === 401 || status === 403)
      throw new Error("GEMINI_UNAUTHORIZED");
    throw err;
  }
};

const geminiChatStream = async function* (
  input: AiChatInput,
): AsyncGenerator<AiChatStreamEvent> {
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

  const modelName =
    input.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(systemInstruction && { systemInstruction }),
    generationConfig: {
      ...(input.temperature !== undefined && {
        temperature: input.temperature,
      }),
      ...(input.maxTokens !== undefined && {
        maxOutputTokens: input.maxTokens,
      }),
    },
  });

  const history = filteredMessages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const msg =
    filteredMessages.length > 0
      ? filteredMessages[filteredMessages.length - 1].content
      : "";
  const chat = model.startChat({ history });

  const result = await chat.sendMessageStream(msg);
  for await (const chunk of result.stream) {
    if (chunk.text()) {
      yield { type: "delta", delta: chunk.text() };
    }
  }
  yield { type: "done", model: modelName };
};

type ProviderName = "groq" | "gemini";

const hasGeminiKey = (): boolean => !!(process.env.GEMINI_API_KEY || "").trim();
const hasGroqKey = (): boolean => !!(process.env.GROQ_API_KEY || "").trim();

/**
 * Resolve provider order (primary, fallback) based on purpose + env.
 * - breakdown (reasoning): Gemini primary, Groq fallback.
 * - chat (realtime): Groq primary, Gemini fallback.
 * - schedule/generic: legacy AI_PROVIDER (default groq).
 */
const resolveProviderOrder = (purpose?: AiChatPurpose): ProviderName[] => {
  const explicit = (
    purpose === "breakdown"
      ? process.env.AI_BREAKDOWN_PROVIDER
      : purpose === "chat"
        ? process.env.AI_CHAT_PROVIDER
        : process.env.AI_PROVIDER
  ) as ProviderName | undefined;

  const preferred: ProviderName =
    explicit === "gemini" || explicit === "groq"
      ? explicit
      : purpose === "breakdown"
        ? hasGeminiKey()
          ? "gemini"
          : "groq"
        : "groq";

  const fallback: ProviderName = preferred === "gemini" ? "groq" : "gemini";

  const order: ProviderName[] = [preferred];
  const fallbackAvailable =
    fallback === "gemini" ? hasGeminiKey() : hasGroqKey();
  if (fallbackAvailable) order.push(fallback);
  return order;
};

const runChat = async (
  provider: ProviderName,
  input: AiChatInput,
): Promise<AiChatResult> =>
  provider === "gemini" ? geminiChat(input) : groqChat(input);

const isRetriableError = (err: any): boolean => {
  const msg = String(err?.message || "");
  if (
    msg.includes("RATE_LIMIT") ||
    msg.includes("UNAUTHORIZED") ||
    msg.includes("API_KEY_MISSING")
  )
    return true;
  const status = err?.status ?? err?.response?.status;
  return status === 429 || status === 500 || status === 502 || status === 503;
};

export const aiProvider: AiProvider = {
  chat: async (input) => {
    const order = resolveProviderOrder(input.purpose);
    let lastErr: any;
    for (const p of order) {
      try {
        return await runChat(p, input);
      } catch (err) {
        lastErr = err;
        if (!isRetriableError(err)) throw err;
        console.warn(
          `[aiProvider] ${p} failed (${(err as any)?.message}), trying fallback...`,
        );
      }
    }
    throw lastErr ?? new Error("AI_PROVIDER_FAILED");
  },
  chatStream: async function* (input) {
    // Streaming chỉ dùng primary (realtime). Fallback stream phức tạp nên bỏ qua.
    const [primary] = resolveProviderOrder(input.purpose);
    if (primary === "gemini") {
      yield* geminiChatStream(input);
      return;
    }
    yield* groqChatStream(input);
  },
};
