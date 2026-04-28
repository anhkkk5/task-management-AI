"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productivityScorer = exports.ProductivityScorer = void 0;
const cache_service_1 = require("./cache.service");
class ProductivityScorer {
    /**
     * Tính điểm productivity có caching
     */
    async calculateHourlyScoresWithCache(userId, completedTasksFn, lookbackDays = 30) {
        const today = new Date().toISOString().split("T")[0];
        const cacheKey = cache_service_1.cacheKeys.productivity(userId, today);
        // Thử lấy từ cache
        const cached = cache_service_1.productivityCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        // Nếu không có, tính toán
        const completedTasks = await completedTasksFn();
        const scores = this.calculateHourlyScores(completedTasks, lookbackDays);
        // Lưu vào cache (1 tiếng)
        cache_service_1.productivityCache.set(cacheKey, scores, 60);
        return scores;
    }
    // Circadian rhythm prior — fallback when no/little user data
    static CIRCADIAN_PRIOR = {
        0: 0.15,
        1: 0.1,
        2: 0.08,
        3: 0.08,
        4: 0.1,
        5: 0.2,
        6: 0.4,
        7: 0.55,
        8: 0.8,
        9: 0.9,
        10: 0.92,
        11: 0.85,
        12: 0.5,
        13: 0.55,
        14: 0.75,
        15: 0.82,
        16: 0.8,
        17: 0.7,
        18: 0.55,
        19: 0.65,
        20: 0.72,
        21: 0.68,
        22: 0.45,
        23: 0.25,
    };
    /**
     * Tính điểm productivity cho từng giờ trong ngày.
     *
     * Improvements over v1:
     * - Exponential decay: recent tasks weigh more (half-life = lookbackDays / 3)
     * - Bayesian smoothing: blends observed score with circadian prior based on confidence
     * - Backward compatible: `daysAgo` field is optional
     */
    calculateHourlyScores(completedTasks, lookbackDays = 30) {
        // Half-life for exponential decay (in days)
        const halfLife = Math.max(3, lookbackDays / 3);
        const decayLambda = Math.LN2 / halfLife;
        const hourlyStats = new Map();
        for (let i = 0; i < 24; i++) {
            hourlyStats.set(i, {
                weightedCompleted: 0,
                weightedTotal: 0,
                weightedDuration: 0,
                rawTotal: 0,
            });
        }
        completedTasks.forEach((task) => {
            const stats = hourlyStats.get(task.hour);
            if (!stats)
                return;
            // Exponential decay weight: recent tasks count more
            const age = task.daysAgo ?? 0;
            const weight = Math.exp(-decayLambda * age);
            stats.weightedTotal += weight;
            stats.weightedDuration += task.duration * weight;
            stats.rawTotal++;
            if (task.completed) {
                stats.weightedCompleted += weight;
            }
        });
        const scores = new Map();
        hourlyStats.forEach((stats, hour) => {
            // Observed score from user data
            const completionRate = stats.weightedTotal > 0
                ? stats.weightedCompleted / stats.weightedTotal
                : 0;
            const avgDuration = stats.weightedTotal > 0
                ? stats.weightedDuration / stats.weightedTotal
                : 60;
            const durationScore = Math.min(Math.max(avgDuration / 60, 0.3), 1);
            const observedScore = completionRate * 0.7 + durationScore * 0.3;
            // Confidence: grows with effective sample size (decay-weighted)
            const confidence = Math.min(stats.weightedTotal / 8, 1);
            // Bayesian smoothing: blend observed with circadian prior
            const prior = ProductivityScorer.CIRCADIAN_PRIOR[hour] ?? 0.5;
            const bayesianScore = observedScore * confidence + prior * (1 - confidence);
            scores.set(hour, {
                hour,
                score: Math.round(bayesianScore * 100) / 100,
                confidence: Math.round(confidence * 100) / 100,
                sampleSize: stats.rawTotal,
            });
        });
        return scores;
    }
    /**
     * Tính productivity scores filtered by day-of-week.
     * Useful for scheduling on a specific day (e.g., Monday vs Friday).
     * Falls back to all-day scores if not enough data for the target day.
     */
    calculateHourlyScoresForDay(completedTasks, targetDayOfWeek, lookbackDays = 30) {
        // Filter to target day
        const dayFiltered = completedTasks.filter((t) => t.dayOfWeek === targetDayOfWeek);
        // If enough data for this day-of-week, use it
        if (dayFiltered.length >= 10) {
            return this.calculateHourlyScores(dayFiltered, lookbackDays);
        }
        // Otherwise blend: 60% day-specific + 40% all-days
        const dayScores = this.calculateHourlyScores(dayFiltered, lookbackDays);
        const allScores = this.calculateHourlyScores(completedTasks, lookbackDays);
        const blended = new Map();
        const dayWeight = Math.min(dayFiltered.length / 10, 0.6);
        const allWeight = 1 - dayWeight;
        for (let h = 0; h < 24; h++) {
            const ds = dayScores.get(h);
            const as = allScores.get(h);
            if (!ds || !as)
                continue;
            blended.set(h, {
                hour: h,
                score: Math.round((ds.score * dayWeight + as.score * allWeight) * 100) / 100,
                confidence: Math.round(Math.max(ds.confidence * dayWeight, as.confidence * allWeight) *
                    100) / 100,
                sampleSize: ds.sampleSize + as.sampleSize,
            });
        }
        return blended;
    }
    /**
     * Tìm top N giờ tốt nhất cho task profile cụ thể
     */
    findOptimalHours(productivityScores, taskProfile, topN = 3) {
        const scores = Array.from(productivityScores.values());
        // Filter theo preferred time of day
        let filtered = scores;
        if (taskProfile.preferredTimeOfDay) {
            const timeRanges = {
                morning: [6, 7, 8, 9, 10, 11],
                afternoon: [12, 13, 14, 15, 16, 17],
                evening: [18, 19, 20, 21],
            };
            const allowedHours = timeRanges[taskProfile.preferredTimeOfDay] || [];
            filtered = scores.filter((s) => allowedHours.includes(s.hour));
        }
        // Boost score cho task khó vào giờ productive
        const weightedScores = filtered.map((score) => {
            let adjustedScore = score.score;
            // Task khó nên vào giờ có confidence cao (đã được chứng minh productive)
            if (taskProfile.difficulty === "hard" && score.confidence > 0.7) {
                adjustedScore *= 1.2;
            }
            // Task cần focus ưu tiên giờ score cao
            if (taskProfile.requiresFocus && score.score > 0.8) {
                adjustedScore *= 1.1;
            }
            return { ...score, score: Math.min(adjustedScore, 1) };
        });
        // Sort by score và trả về top N
        return weightedScores.sort((a, b) => b.score - a.score).slice(0, topN);
    }
    /**
     * So sánh 2 slots cho cùng task
     */
    compareSlots(slot1, slot2, taskProfile, productivityScores) {
        const score1 = this.calculateSlotScore(slot1, taskProfile, productivityScores);
        const score2 = this.calculateSlotScore(slot2, taskProfile, productivityScores);
        if (score1 >= score2) {
            return {
                better: slot1,
                reason: `Slot 1 có điểm ${score1.toFixed(2)} cao hơn slot 2 (${score2.toFixed(2)})`,
            };
        }
        else {
            return {
                better: slot2,
                reason: `Slot 2 có điểm ${score2.toFixed(2)} cao hơn slot 1 (${score1.toFixed(2)})`,
            };
        }
    }
    /**
     * Tính điểm tổng hợp cho 1 slot
     */
    calculateSlotScore(slot, taskProfile, productivityScores) {
        const hour = slot.start.getHours();
        const productivityScore = productivityScores.get(hour)?.score || 0.5;
        // Slot phải đủ dài cho task
        const durationRatio = Math.min(slot.duration / taskProfile.estimatedDuration, 1);
        // Weighted combination
        const weights = {
            productivity: 0.5,
            slotAdequacy: 0.3,
            difficultyMatch: 0.2,
        };
        let score = productivityScore * weights.productivity +
            durationRatio * weights.slotAdequacy;
        // Bonus nếu task khó vào giờ productive
        if (taskProfile.difficulty === "hard" && productivityScore > 0.8) {
            score += weights.difficultyMatch;
        }
        return Math.min(score, 1);
    }
    /**
     * Phân tích trend productivity
     */
    analyzeTrend(historicalScores, daysToCompare = 7) {
        if (historicalScores.length < daysToCompare) {
            return { improving: false, bestHour: 9, worstHour: 14 };
        }
        const recent = historicalScores.slice(-daysToCompare);
        const older = historicalScores.slice(0, historicalScores.length - daysToCompare);
        // Tính average score mỗi ngày
        const recentAvg = recent.map((day) => Array.from(day.values()).reduce((sum, s) => sum + s.score, 0) /
            day.size);
        const olderAvg = older.map((day) => Array.from(day.values()).reduce((sum, s) => sum + s.score, 0) /
            day.size);
        const recentMean = recentAvg.reduce((a, b) => a + b, 0) / recentAvg.length;
        const olderMean = olderAvg.reduce((a, b) => a + b, 0) / olderAvg.length;
        // Tìm best/worst hour từ recent data
        const allRecentScores = new Map();
        recent.forEach((day) => {
            day.forEach((score, hour) => {
                if (!allRecentScores.has(hour)) {
                    allRecentScores.set(hour, []);
                }
                allRecentScores.get(hour).push(score.score);
            });
        });
        let bestHour = 9;
        let worstHour = 14;
        let bestScore = 0;
        let worstScore = 1;
        allRecentScores.forEach((scores, hour) => {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            if (avg > bestScore) {
                bestScore = avg;
                bestHour = hour;
            }
            if (avg < worstScore) {
                worstScore = avg;
                worstHour = hour;
            }
        });
        return {
            improving: recentMean > olderMean,
            bestHour,
            worstHour,
        };
    }
}
exports.ProductivityScorer = ProductivityScorer;
exports.productivityScorer = new ProductivityScorer();
