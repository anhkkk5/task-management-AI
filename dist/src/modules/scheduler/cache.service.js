"use strict";
/**
 * Simple Cache Service cho Scheduler
 * - In-memory cache với TTL
 * - Có thể thay bằng Redis trong production
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheKeys = exports.busySlotsCache = exports.slotCache = exports.productivityCache = exports.CacheService = void 0;
class CacheService {
    cache = new Map();
    defaultTTL; // milliseconds
    constructor(defaultTTLMinutes = 5) {
        this.defaultTTL = defaultTTLMinutes * 60 * 1000;
        // Auto cleanup mỗi 10 phút
        setInterval(() => this.cleanup(), 10 * 60 * 1000);
    }
    /**
     * Set giá trị vào cache
     */
    set(key, value, ttlMinutes) {
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
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        // Check expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    /**
     * Xóa key khỏi cache
     */
    delete(key) {
        this.cache.delete(key);
    }
    /**
     * Xóa nhiều keys theo pattern
     */
    deletePattern(pattern) {
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
    clear() {
        this.cache.clear();
    }
    /**
     * Get hoặc compute nếu không có trong cache
     */
    async getOrCompute(key, computeFn, ttlMinutes) {
        const cached = this.get(key);
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
    cleanup() {
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
    getStats() {
        return {
            size: this.cache.size,
        };
    }
}
exports.CacheService = CacheService;
// Cache instances cho từng loại data
exports.productivityCache = new CacheService(60); // 1 tiếng
exports.slotCache = new CacheService(5); // 5 phút
exports.busySlotsCache = new CacheService(2); // 2 phút
// Cache key generators
exports.cacheKeys = {
    productivity: (userId, date) => `productivity:${userId}:${date}`,
    freeSlots: (userId, date) => `freeslots:${userId}:${date}`,
    busySlots: (userId, date) => `busyslots:${userId}:${date}`,
    schedule: (userId, date) => `schedule:${userId}:${date}`,
};
