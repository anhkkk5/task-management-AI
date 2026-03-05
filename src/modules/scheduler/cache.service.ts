/**
 * Simple Cache Service cho Scheduler
 * - In-memory cache với TTL
 * - Có thể thay bằng Redis trong production
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number; // milliseconds

  constructor(defaultTTLMinutes: number = 5) {
    this.defaultTTL = defaultTTLMinutes * 60 * 1000;
    // Auto cleanup mỗi 10 phút
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Set giá trị vào cache
   */
  set<T>(key: string, value: T, ttlMinutes?: number): void {
    const ttl = (ttlMinutes || this.defaultTTL / 60 / 1000) * 60 * 1000;
    const expiresAt = Date.now() + ttl;
    
    this.cache.set(key, {
      value,
      expiresAt,
    });
  }

  /**
   * Get giá trị từ cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // Check expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Xóa key khỏi cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Xóa nhiều keys theo pattern
   */
  deletePattern(pattern: string): void {
    const regex = new RegExp(pattern.replace('*', '.*'));
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get hoặc compute nếu không có trong cache
   */
  async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    ttlMinutes?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const computed = await computeFn();
    this.set(key, computed, ttlMinutes);
    return computed;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Stats
   */
  getStats(): { size: number; hitRate?: number } {
    return {
      size: this.cache.size,
    };
  }
}

// Cache instances cho từng loại data
export const productivityCache = new CacheService(60); // 1 tiếng
export const slotCache = new CacheService(5); // 5 phút
export const busySlotsCache = new CacheService(2); // 2 phút

// Cache key generators
export const cacheKeys = {
  productivity: (userId: string, date: string) => `productivity:${userId}:${date}`,
  freeSlots: (userId: string, date: string) => `freeslots:${userId}:${date}`,
  busySlots: (userId: string, date: string) => `busyslots:${userId}:${date}`,
  schedule: (userId: string, date: string) => `schedule:${userId}:${date}`,
};
