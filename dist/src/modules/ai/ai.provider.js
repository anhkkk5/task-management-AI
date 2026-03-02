"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiProvider = void 0;
const openai_1 = __importDefault(require("openai"));
exports.aiProvider = {
    chat: async (input) => {
        const apiKey = process.env.GROQ_API_KEY || "";
        if (!apiKey) {
            throw new Error("GROQ_API_KEY_MISSING");
        }
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
            const anyErr = err;
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
    chatStream: async function* (input) {
        const apiKey = process.env.GROQ_API_KEY || "";
        if (!apiKey) {
            throw new Error("GROQ_API_KEY_MISSING");
        }
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
            // openai SDK returns an async iterable of chunks when stream=true
            for await (const chunk of stream) {
                const delta = chunk?.choices?.[0]?.delta?.content !== undefined
                    ? String(chunk.choices[0].delta.content)
                    : "";
                if (delta) {
                    yield { type: "delta", delta };
                }
            }
            yield { type: "done", model };
        }
        catch (err) {
            const anyErr = err;
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
