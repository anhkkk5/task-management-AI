import { getRedis } from "../../services/redis.service";

const ONLINE_KEY_PREFIX = "online:";
const ONLINE_TTL_SECONDS = 300; // 5 minutes

export const presenceService = {
  setUserOnline: async (userId: string, socketId: string): Promise<void> => {
    const redis = getRedis();
    await redis.setex(`${ONLINE_KEY_PREFIX}${userId}`, ONLINE_TTL_SECONDS, socketId);
  },

  setUserOffline: async (userId: string): Promise<void> => {
    const redis = getRedis();
    await redis.del(`${ONLINE_KEY_PREFIX}${userId}`);
  },

  isUserOnline: async (userId: string): Promise<boolean> => {
    const redis = getRedis();
    const socketId = await redis.get(`${ONLINE_KEY_PREFIX}${userId}`);
    return !!socketId;
  },

  getOnlineUsers: async (): Promise<string[]> => {
    const redis = getRedis();
    const keys = await redis.keys(`${ONLINE_KEY_PREFIX}*`);
    return keys.map((key) => key.replace(ONLINE_KEY_PREFIX, ""));
  },

  refreshUserOnline: async (userId: string): Promise<void> => {
    const redis = getRedis();
    const key = `${ONLINE_KEY_PREFIX}${userId}`;
    const exists = await redis.exists(key);
    if (exists) {
      await redis.expire(key, ONLINE_TTL_SECONDS);
    }
  },

  // Typing indicator with short TTL
  setUserTyping: async (conversationId: string, userId: string): Promise<void> => {
    const redis = getRedis();
    await redis.setex(
      `typing:${conversationId}:${userId}`,
      5, // 5 seconds TTL
      Date.now().toString(),
    );
  },

  clearUserTyping: async (conversationId: string, userId: string): Promise<void> => {
    const redis = getRedis();
    await redis.del(`typing:${conversationId}:${userId}`);
  },

  getTypingUsers: async (conversationId: string): Promise<string[]> => {
    const redis = getRedis();
    const keys = await redis.keys(`typing:${conversationId}:*`);
    return keys.map((key) => {
      const parts = key.split(":");
      return parts[parts.length - 1];
    });
  },
};
