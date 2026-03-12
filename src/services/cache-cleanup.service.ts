import { getRedis } from "./redis.service";
import { CACHE_VERSION } from "../config/cache-version";

/**
 * Cache Cleanup Service
 * Tự động xóa cache của các version cũ
 */

export class CacheCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Start cleanup job (chạy mỗi 1 giờ)
   */
  start(): void {
    if (this.cleanupInterval) {
      return; // Already running
    }

    console.log("[CacheCleanup] Starting cache cleanup job...");

    // Chạy ngay lần đầu
    this.cleanup().catch((err) => {
      console.error("[CacheCleanup] Initial cleanup failed:", err);
    });

    // Sau đó chạy mỗi 1 giờ
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup().catch((err) => {
          console.error("[CacheCleanup] Cleanup failed:", err);
        });
      },
      60 * 60 * 1000, // 1 giờ
    );
  }

  /**
   * Stop cleanup job
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log("[CacheCleanup] Stopped cache cleanup job");
    }
  }

  /**
   * Cleanup cache của các version cũ
   */
  async cleanup(): Promise<void> {
    try {
      const redis = getRedis();
      const currentVersions = Object.values(CACHE_VERSION);

      console.log("[CacheCleanup] Current versions:", currentVersions);

      let totalDeleted = 0;

      // Scan tất cả keys
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          "MATCH",
          "*:*",
          "COUNT",
          100,
        );
        cursor = nextCursor;

        if (!Array.isArray(keys) || keys.length === 0) {
          continue;
        }

        // Filter keys có version cũ
        const keysToDelete: string[] = [];
        for (const key of keys) {
          const version = this.extractVersion(key);
          if (version && !currentVersions.includes(version)) {
            keysToDelete.push(key);
          }
        }

        // Delete batch
        if (keysToDelete.length > 0) {
          await redis.del(...keysToDelete);
          totalDeleted += keysToDelete.length;
          console.log(
            `[CacheCleanup] Deleted ${keysToDelete.length} old cache keys`,
          );
        }
      } while (cursor !== "0");

      if (totalDeleted > 0) {
        console.log(
          `[CacheCleanup] Total deleted: ${totalDeleted} old cache keys`,
        );
      } else {
        console.log("[CacheCleanup] No old cache keys found");
      }
    } catch (error) {
      console.error("[CacheCleanup] Error during cleanup:", error);
      throw error;
    }
  }

  /**
   * Extract version từ cache key
   * VD: "v1:ai:prompt:abc123" -> "v1"
   */
  private extractVersion(key: string): string | null {
    const match = key.match(/^(v\d+):/);
    return match ? match[1] : null;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    keysByVersion: Record<string, number>;
    oldVersionKeys: number;
  }> {
    try {
      const redis = getRedis();
      const currentVersions = Object.values(CACHE_VERSION);
      const keysByVersion: Record<string, number> = {};
      let totalKeys = 0;
      let oldVersionKeys = 0;

      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          "MATCH",
          "*:*",
          "COUNT",
          100,
        );
        cursor = nextCursor;

        if (!Array.isArray(keys)) continue;

        totalKeys += keys.length;

        for (const key of keys) {
          const version = this.extractVersion(key);
          if (version) {
            keysByVersion[version] = (keysByVersion[version] || 0) + 1;
            if (!currentVersions.includes(version)) {
              oldVersionKeys++;
            }
          }
        }
      } while (cursor !== "0");

      return {
        totalKeys,
        keysByVersion,
        oldVersionKeys,
      };
    } catch (error) {
      console.error("[CacheCleanup] Error getting stats:", error);
      return {
        totalKeys: 0,
        keysByVersion: {},
        oldVersionKeys: 0,
      };
    }
  }
}

export const cacheCleanupService = new CacheCleanupService();
