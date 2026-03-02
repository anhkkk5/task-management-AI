"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.presenceService = void 0;
const redis_service_1 = require("../../services/redis.service");
const ONLINE_KEY_PREFIX = "online:";
const ONLINE_TTL_SECONDS = 300; // 5 minutes
exports.presenceService = {
    setUserOnline: async (userId, socketId) => {
        const redis = (0, redis_service_1.getRedis)();
        await redis.setex(`${ONLINE_KEY_PREFIX}${userId}`, ONLINE_TTL_SECONDS, socketId);
    },
    setUserOffline: async (userId) => {
        const redis = (0, redis_service_1.getRedis)();
        await redis.del(`${ONLINE_KEY_PREFIX}${userId}`);
    },
    isUserOnline: async (userId) => {
        const redis = (0, redis_service_1.getRedis)();
        const socketId = await redis.get(`${ONLINE_KEY_PREFIX}${userId}`);
        return !!socketId;
    },
    getOnlineUsers: async () => {
        const redis = (0, redis_service_1.getRedis)();
        const keys = await redis.keys(`${ONLINE_KEY_PREFIX}*`);
        return keys.map((key) => key.replace(ONLINE_KEY_PREFIX, ""));
    },
    refreshUserOnline: async (userId) => {
        const redis = (0, redis_service_1.getRedis)();
        const key = `${ONLINE_KEY_PREFIX}${userId}`;
        const exists = await redis.exists(key);
        if (exists) {
            await redis.expire(key, ONLINE_TTL_SECONDS);
        }
    },
    // Typing indicator with short TTL
    setUserTyping: async (conversationId, userId) => {
        const redis = (0, redis_service_1.getRedis)();
        await redis.setex(`typing:${conversationId}:${userId}`, 5, // 5 seconds TTL
        Date.now().toString());
    },
    clearUserTyping: async (conversationId, userId) => {
        const redis = (0, redis_service_1.getRedis)();
        await redis.del(`typing:${conversationId}:${userId}`);
    },
    getTypingUsers: async (conversationId) => {
        const redis = (0, redis_service_1.getRedis)();
        const keys = await redis.keys(`typing:${conversationId}:*`);
        return keys.map((key) => {
            const parts = key.split(":");
            return parts[parts.length - 1];
        });
    },
};
