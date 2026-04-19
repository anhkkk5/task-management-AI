"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiCacheService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const redis_service_1 = require("../../services/redis.service");
const cache_version_1 = require("../../config/cache-version");
const AI_CACHE_TTL_SECONDS = 300; // 5 minutes default for AI responses
exports.aiCacheService = {
    buildPromptHash: (prompt) => {
        return crypto_1.default.createHash("sha256").update(prompt).digest("hex");
    },
    getCachedPrompt: async (promptHash) => {
        const redis = (0, redis_service_1.getRedis)();
        const key = (0, cache_version_1.versionedKey)(cache_version_1.CACHE_VERSION.AI, `ai:prompt:${promptHash}`);
        return redis.get(key);
    },
    setCachedPrompt: async (promptHash, value, ttlSeconds) => {
        const redis = (0, redis_service_1.getRedis)();
        const key = (0, cache_version_1.versionedKey)(cache_version_1.CACHE_VERSION.AI, `ai:prompt:${promptHash}`);
        await redis.set(key, value, "EX", ttlSeconds);
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
                .update(params.title +
                (params.description || "") +
                (params.totalMinutes?.toString() || ""))
                .digest("hex")
                .slice(0, 16);
            const baseKey = `ai:task-breakdown:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
            const key = (0, cache_version_1.versionedKey)(cache_version_1.CACHE_VERSION.AI, baseKey);
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
                .update(params.title +
                (params.description || "") +
                (params.totalMinutes?.toString() || ""))
                .digest("hex")
                .slice(0, 16);
            const baseKey = `ai:task-breakdown:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
            const key = (0, cache_version_1.versionedKey)(cache_version_1.CACHE_VERSION.AI, baseKey);
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
            const baseKey = `ai:priority-suggest:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
            const key = (0, cache_version_1.versionedKey)(cache_version_1.CACHE_VERSION.AI, baseKey);
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
            const baseKey = `ai:priority-suggest:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
            const key = (0, cache_version_1.versionedKey)(cache_version_1.CACHE_VERSION.AI, baseKey);
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
