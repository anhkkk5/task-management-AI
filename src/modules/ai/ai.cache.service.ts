import crypto from "crypto";
import { getRedis } from "../../services/redis.service";

export const aiCacheService = {
  buildPromptHash: (prompt: string): string => {
    return crypto.createHash("sha256").update(prompt).digest("hex");
  },

  getCachedPrompt: async (promptHash: string): Promise<string | null> => {
    const redis = getRedis();
    return redis.get(`ai:prompt:${promptHash}`);
  },

  setCachedPrompt: async (
    promptHash: string,
    value: string,
    ttlSeconds: number,
  ): Promise<void> => {
    const redis = getRedis();
    await redis.set(`ai:prompt:${promptHash}`, value, "EX", ttlSeconds);
  },
};
