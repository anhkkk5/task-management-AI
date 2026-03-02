"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiCacheService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const redis_service_1 = require("../../services/redis.service");
const AI_CACHE_TTL_SECONDS = 300; // 5 minutes default for AI responses
exports.aiCacheService = {
    buildPromptHash: (prompt) => {
        return crypto_1.default.createHash("sha256").update(prompt).digest("hex");
    },
    getCachedPrompt: async (promptHash) => {
        const redis = (0, redis_service_1.getRedis)();
        return redis.get(`ai:prompt:${promptHash}`);
    },
    setCachedPrompt: async (promptHash, value, ttlSeconds) => {
        const redis = (0, redis_service_1.getRedis)();
        await redis.set(`ai:prompt:${promptHash}`, value, "EX", ttlSeconds);
    },
    // Task Breakdown cache methods
    getTaskBreakdown: async (params) => {
        try {
            const redis = (0, redis_service_1.getRedis)();
            const deadlinePart = params.deadline
                ? params.deadline.toISOString()
                : "no-deadline";
            const modelPart = params.model || "default";
            const titleHash = crypto_1.default
                .createHash("sha256")
                .update(params.title)
                .digest("hex")
                .slice(0, 16);
            const key = `ai:task-breakdown:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
            const cached = await redis.get(key);
            if (!cached)
                return null;
            return JSON.parse(cached);
        }
        catch {
            return null;
        }
    },
    setTaskBreakdown: async (params, value, ttlSeconds = AI_CACHE_TTL_SECONDS) => {
        try {
            const redis = (0, redis_service_1.getRedis)();
            const deadlinePart = params.deadline
                ? params.deadline.toISOString()
                : "no-deadline";
            const modelPart = params.model || "default";
            const titleHash = crypto_1.default
                .createHash("sha256")
                .update(params.title)
                .digest("hex")
                .slice(0, 16);
            const key = `ai:task-breakdown:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
            await redis.setex(key, ttlSeconds, JSON.stringify(value));
        }
        catch {
            // Silently fail - cache is best-effort
        }
    },
    // Priority Suggest cache methods
    getPrioritySuggest: async (params) => {
        try {
            const redis = (0, redis_service_1.getRedis)();
            const deadlinePart = params.deadline
                ? params.deadline.toISOString()
                : "no-deadline";
            const modelPart = params.model || "default";
            const titleHash = crypto_1.default
                .createHash("sha256")
                .update(params.title)
                .digest("hex")
                .slice(0, 16);
            const key = `ai:priority-suggest:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
            const cached = await redis.get(key);
            if (!cached)
                return null;
            return JSON.parse(cached);
        }
        catch {
            return null;
        }
    },
    setPrioritySuggest: async (params, value, ttlSeconds = AI_CACHE_TTL_SECONDS) => {
        try {
            const redis = (0, redis_service_1.getRedis)();
            const deadlinePart = params.deadline
                ? params.deadline.toISOString()
                : "no-deadline";
            const modelPart = params.model || "default";
            const titleHash = crypto_1.default
                .createHash("sha256")
                .update(params.title)
                .digest("hex")
                .slice(0, 16);
            const key = `ai:priority-suggest:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
            await redis.setex(key, ttlSeconds, JSON.stringify(value));
        }
        catch {
            // Silently fail - cache is best-effort
        }
    },
    invalidateUserAiCache: async (userId) => {
        try {
            const redis = (0, redis_service_1.getRedis)();
            const prefix = `ai:`;
            let cursor = "0";
            const keysToDelete = [];
            do {
                const [next, batch] = await redis.scan(cursor, "MATCH", `${prefix}*:${userId}:*`, "COUNT", 100);
                cursor = next;
                if (Array.isArray(batch)) {
                    keysToDelete.push(...batch);
                }
            } while (cursor !== "0");
            if (keysToDelete.length) {
                await redis.del(...keysToDelete);
            }
        }
        catch {
            // Silently fail
        }
    },
};
