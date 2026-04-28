"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiProvider = void 0;
const openai_1 = __importDefault(require("openai"));
const generative_ai_1 = require("@google/generative-ai");
const groqChat = async (input) => {
    const apiKey = process.env.GROQ_API_KEY || "";
    if (!apiKey)
        throw new Error("GROQ_API_KEY_MISSING");
    const client = new openai_1.default({
        apiKey,
        baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    });
    const model = (input.model ||
        process.env.GROQ_MODEL ||
        "llama-3.1-8b-instant").trim();
    try {
        const response = await client.chat.completions.create({
            model,
            messages: input.messages,
            temperature: input.temperature,
            max_tokens: input.maxTokens,
            ...(input.responseFormat === "json_object"
                ? { response_format: { type: "json_object" } }
                : {}),
        });
        const content = response.choices?.[0]?.message?.content ?? "";
        return {
            content,
            model: response.model,
            usage: response.usage
                ? {
                    promptTokens: response.usage.prompt_tokens,
                    completionTokens: response.usage.completion_tokens,
                    totalTokens: response.usage.total_tokens,
                }
                : undefined,
        };
    }
    catch (err) {
        if (err?.status === 429)
            throw new Error("GROQ_RATE_LIMIT");
        if (err?.status === 401 || err?.status === 403)
            throw new Error("GROQ_UNAUTHORIZED");
        throw err;
    }
};
const groqChatStream = async function* (input) {
    const apiKey = process.env.GROQ_API_KEY || "";
    if (!apiKey)
        throw new Error("GROQ_API_KEY_MISSING");
    const client = new openai_1.default({
        apiKey,
        baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    });
    const model = (input.model ||
        process.env.GROQ_MODEL ||
        "llama-3.1-8b-instant").trim();
    try {
        const stream = await client.chat.completions.create({
            model,
            messages: input.messages,
            temperature: input.temperature,
            max_tokens: input.maxTokens,
            stream: true,
        });
        for await (const chunk of stream) {
            const delta = chunk?.choices?.[0]?.delta?.content !== undefined
                ? String(chunk.choices[0].delta.content)
                : "";
            if (delta)
                yield { type: "delta", delta };
        }
        yield { type: "done", model };
    }
    catch (err) {
        if (err?.status === 429)
            throw new Error("GROQ_RATE_LIMIT");
        if (err?.status === 401 || err?.status === 403)
            throw new Error("GROQ_UNAUTHORIZED");
        throw err;
    }
};
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const geminiChat = async (input) => {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey)
        throw new Error("GEMINI_API_KEY_MISSING");
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    let systemInstruction = "";
    const filteredMessages = input.messages.filter((m) => {
        if (m.role === "system") {
            systemInstruction += m.content + "\n";
            return false;
        }
        return true;
    });
    const modelName = input.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
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
    const msg = filteredMessages.length > 0
        ? filteredMessages[filteredMessages.length - 1].content
        : "";
    const chat = model.startChat({ history });
    try {
        const result = await chat.sendMessage(msg);
        return {
            content: result.response.text(),
            model: modelName,
        };
    }
    catch (err) {
        const status = err?.status ?? err?.response?.status;
        const errMsg = String(err?.message || "").toLowerCase();
        if (status === 429 ||
            errMsg.includes("429") ||
            errMsg.includes("resource_exhausted") ||
            errMsg.includes("resource has been exhausted") ||
            errMsg.includes("quota") ||
            errMsg.includes("rate limit"))
            throw new Error("GEMINI_RATE_LIMIT");
        if (status === 401 ||
            status === 403 ||
            errMsg.includes("permission_denied") ||
            errMsg.includes("api key not valid"))
            throw new Error("GEMINI_UNAUTHORIZED");
        throw err;
    }
};
const geminiChatStream = async function* (input) {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey)
        throw new Error("GEMINI_API_KEY_MISSING");
    const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
    let systemInstruction = "";
    const filteredMessages = input.messages.filter((m) => {
        if (m.role === "system") {
            systemInstruction += m.content + "\n";
            return false;
        }
        return true;
    });
    const modelName = input.model || process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
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
    const msg = filteredMessages.length > 0
        ? filteredMessages[filteredMessages.length - 1].content
        : "";
    const chat = model.startChat({ history });
    try {
        const result = await chat.sendMessageStream(msg);
        for await (const chunk of result.stream) {
            if (chunk.text()) {
                yield { type: "delta", delta: chunk.text() };
            }
        }
        yield { type: "done", model: modelName };
    }
    catch (err) {
        const status = err?.status ?? err?.response?.status;
        const errMsg = String(err?.message || "").toLowerCase();
        if (status === 429 ||
            errMsg.includes("429") ||
            errMsg.includes("resource_exhausted") ||
            errMsg.includes("resource has been exhausted") ||
            errMsg.includes("quota") ||
            errMsg.includes("rate limit"))
            throw new Error("GEMINI_RATE_LIMIT");
        if (status === 401 ||
            status === 403 ||
            errMsg.includes("permission_denied") ||
            errMsg.includes("api key not valid"))
            throw new Error("GEMINI_UNAUTHORIZED");
        throw err;
    }
};
const hasGroqKey = () => !!(process.env.GROQ_API_KEY || "").trim();
/**
 * Groq-only routing: always use Groq for all purposes.
 */
const resolveProviderOrder = (_purpose) => {
    if (!hasGroqKey())
        return [];
    return ["groq"];
};
const runChat = async (_provider, input) => groqChat(input);
const isRetriableError = (err) => {
    const msg = String(err?.message || "");
    if (msg.includes("RATE_LIMIT") ||
        msg.includes("UNAUTHORIZED") ||
        msg.includes("API_KEY_MISSING"))
        return true;
    const lower = msg.toLowerCase();
    if (lower.includes("resource_exhausted") ||
        lower.includes("resource has been exhausted") ||
        lower.includes("quota") ||
        lower.includes("rate limit") ||
        lower.includes("too many requests") ||
        lower.includes("permission_denied") ||
        lower.includes("api key not valid"))
        return true;
    const status = err?.status ?? err?.response?.status;
    return status === 429 || status === 500 || status === 502 || status === 503;
};
const groqChatWithTools = async (input) => {
    const apiKey = process.env.GROQ_API_KEY || "";
    if (!apiKey)
        throw new Error("GROQ_API_KEY_MISSING");
    const client = new openai_1.default({
        apiKey,
        baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    });
    // gpt-oss-20b on Groq emits proper OpenAI tool_calls reliably; Llama models
    // frequently regress to `<function=NAME(...)></function>` text. Prefer OSS.
    const model = (input.model ||
        process.env.GROQ_TOOL_MODEL ||
        "openai/gpt-oss-20b").trim();
    try {
        const response = await client.chat.completions.create({
            model,
            messages: input.messages,
            temperature: input.temperature,
            max_tokens: input.maxTokens,
            ...(input.tools && input.tools.length
                ? { tools: input.tools, tool_choice: input.toolChoice ?? "auto" }
                : {}),
        });
        const choice = response.choices?.[0]?.message;
        const content = choice?.content ?? "";
        const rawToolCalls = choice?.tool_calls;
        const toolCalls = rawToolCalls && rawToolCalls.length
            ? rawToolCalls
                .filter((c) => c.type === "function" && c.function?.name)
                .map((c) => ({
                id: c.id,
                name: c.function.name,
                arguments: c.function.arguments || "{}",
            }))
            : undefined;
        return {
            content,
            model: response.model,
            usage: response.usage
                ? {
                    promptTokens: response.usage.prompt_tokens,
                    completionTokens: response.usage.completion_tokens,
                    totalTokens: response.usage.total_tokens,
                }
                : undefined,
            toolCalls,
        };
    }
    catch (err) {
        if (err?.status === 429)
            throw new Error("GROQ_RATE_LIMIT");
        if (err?.status === 401 || err?.status === 403)
            throw new Error("GROQ_UNAUTHORIZED");
        // Groq sometimes rejects malformed tool calls (Llama models occasionally
        // emit `<function=NAME({...})</function>` text instead of structured
        // tool_calls). Salvage the call from `failed_generation` so the upstream
        // loop can still execute the tool.
        const code = err?.code || err?.error?.code;
        const failedGen = err?.error?.failed_generation ||
            err?.response?.data?.error?.failed_generation;
        if (code === "tool_use_failed" && typeof failedGen === "string") {
            const salvaged = salvageMalformedToolCall(failedGen);
            if (salvaged) {
                return {
                    content: "",
                    model,
                    toolCalls: [salvaged],
                };
            }
        }
        throw err;
    }
};
/**
 * Parse Llama "tool_use_failed" generations into an AiToolCall. Groq returns
 * different malformations:
 *   - `<function=NAME({"a":1})</function>`     (with parens)
 *   - `<function=NAME {"a":1}</function>`      (no parens, just whitespace)
 *   - `<function=NAME({"a":1})>`               (no close tag)
 *   - `<|python_tag|>NAME.call({"a":1})`       (rare)
 * The JSON arguments are always usable; only the wrapper differs.
 */
const salvageMalformedToolCall = (raw) => {
    // 1) `<function=NAME` then `(...)` or whitespace, then JSON, optionally
    //    closed by `)` and `</function>` or `>`.
    const re = /<function\s*=\s*([a-zA-Z_][\w]*)\s*\(?\s*(\{[\s\S]*\})\s*\)?\s*<\/?function\s*>?/;
    const m = raw.match(re);
    if (m) {
        const name = m[1];
        const args = m[2];
        try {
            JSON.parse(args);
        }
        catch {
            return null;
        }
        return {
            id: `call_salvaged_${Date.now()}`,
            name,
            arguments: args,
        };
    }
    // 2) Fallback: any "NAME({...})" pattern in the raw text.
    const fallback = raw.match(/([a-zA-Z_][\w]*)\s*\(\s*(\{[\s\S]*\})\s*\)/);
    if (fallback) {
        const name = fallback[1];
        const args = fallback[2];
        try {
            JSON.parse(args);
        }
        catch {
            return null;
        }
        return {
            id: `call_salvaged_${Date.now()}`,
            name,
            arguments: args,
        };
    }
    return null;
};
exports.aiProvider = {
    chat: async (input) => {
        const order = resolveProviderOrder(input.purpose);
        if (!order.length)
            throw new Error("GROQ_API_KEY_MISSING");
        let lastErr;
        for (const p of order) {
            try {
                return await runChat(p, input);
            }
            catch (err) {
                lastErr = err;
                if (!isRetriableError(err))
                    throw err;
                console.warn(`[aiProvider] ${p} failed (${err?.message}).`);
            }
        }
        console.error(`[aiProvider] All providers failed. Order: ${order.join(" → ")}. Last error: ${lastErr?.message}`);
        throw lastErr ?? new Error("AI_PROVIDER_FAILED");
    },
    chatStream: async function* (input) {
        if (!hasGroqKey())
            throw new Error("GROQ_API_KEY_MISSING");
        yield* groqChatStream(input);
    },
    chatWithTools: async (input) => {
        if (!hasGroqKey())
            throw new Error("GROQ_API_KEY_MISSING");
        return groqChatWithTools(input);
    },
};
