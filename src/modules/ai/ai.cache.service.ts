import crypto from "crypto";
import { getRedis } from "../../services/redis.service";

const AI_CACHE_TTL_SECONDS = 300; // 5 minutes default for AI responses

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

  // Task Breakdown cache methods
  getTaskBreakdown: async (params: {
    userId: string;
    title: string;
    deadline?: Date;
    model?: string;
  }): Promise<{ steps: { title: string; status: string }[] } | null> => {
    try {
      const redis = getRedis();
      const deadlinePart = params.deadline
        ? params.deadline.toISOString()
        : "no-deadline";
      const modelPart = params.model || "default";
      const titleHash = crypto
        .createHash("sha256")
        .update(params.title)
        .digest("hex")
        .slice(0, 16);
      const key = `ai:task-breakdown:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
      const cached = await redis.get(key);
      if (!cached) return null;
      return JSON.parse(cached) as {
        steps: { title: string; status: string }[];
      };
    } catch {
      return null;
    }
  },

  setTaskBreakdown: async (
    params: {
      userId: string;
      title: string;
      deadline?: Date;
      model?: string;
    },
    value: { steps: { title: string; status: string }[] },
    ttlSeconds: number = AI_CACHE_TTL_SECONDS,
  ): Promise<void> => {
    try {
      const redis = getRedis();
      const deadlinePart = params.deadline
        ? params.deadline.toISOString()
        : "no-deadline";
      const modelPart = params.model || "default";
      const titleHash = crypto
        .createHash("sha256")
        .update(params.title)
        .digest("hex")
        .slice(0, 16);
      const key = `ai:task-breakdown:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // Silently fail - cache is best-effort
    }
  },

  // Priority Suggest cache methods
  getPrioritySuggest: async (params: {
    userId: string;
    title: string;
    deadline?: Date;
    model?: string;
  }): Promise<{ priority: string; reason?: string } | null> => {
    try {
      const redis = getRedis();
      const deadlinePart = params.deadline
        ? params.deadline.toISOString()
        : "no-deadline";
      const modelPart = params.model || "default";
      const titleHash = crypto
        .createHash("sha256")
        .update(params.title)
        .digest("hex")
        .slice(0, 16);
      const key = `ai:priority-suggest:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
      const cached = await redis.get(key);
      if (!cached) return null;
      return JSON.parse(cached) as { priority: string; reason?: string };
    } catch {
      return null;
    }
  },

  setPrioritySuggest: async (
    params: {
      userId: string;
      title: string;
      deadline?: Date;
      model?: string;
    },
    value: { priority: string; reason?: string },
    ttlSeconds: number = AI_CACHE_TTL_SECONDS,
  ): Promise<void> => {
    try {
      const redis = getRedis();
      const deadlinePart = params.deadline
        ? params.deadline.toISOString()
        : "no-deadline";
      const modelPart = params.model || "default";
      const titleHash = crypto
        .createHash("sha256")
        .update(params.title)
        .digest("hex")
        .slice(0, 16);
      const key = `ai:priority-suggest:${params.userId}:${titleHash}:${deadlinePart}:${modelPart}`;
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // Silently fail - cache is best-effort
    }
  },

  invalidateUserAiCache: async (userId: string): Promise<void> => {
    try {
      const redis = getRedis();
      const prefix = `ai:`;
      let cursor = "0";
      const keysToDelete: string[] = [];
      do {
        const [next, batch] = await redis.scan(
          cursor,
          "MATCH",
          `${prefix}*:${userId}:*`,
          "COUNT",
          100,
        );
        cursor = next;
        if (Array.isArray(batch)) {
          keysToDelete.push(...batch);
        }
      } while (cursor !== "0");

      if (keysToDelete.length) {
        await redis.del(...keysToDelete);
      }
    } catch {
      // Silently fail
    }
  },
};
