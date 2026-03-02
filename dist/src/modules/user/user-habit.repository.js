"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userHabitRepository = void 0;
const mongoose_1 = require("mongoose");
const user_habit_model_1 = require("./user-habit.model");
exports.userHabitRepository = {
    findByUserId: async (userId) => {
        return user_habit_model_1.UserHabit.findOne({ userId }).exec();
    },
    createOrUpdate: async (userId, data) => {
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const habit = await user_habit_model_1.UserHabit.findOneAndUpdate({ userId: userObjectId }, {
            $set: {
                ...(data.productiveHours !== undefined
                    ? { productiveHours: data.productiveHours }
                    : {}),
                ...(data.preferredBreakDuration !== undefined
                    ? { preferredBreakDuration: data.preferredBreakDuration }
                    : {}),
                ...(data.maxFocusDuration !== undefined
                    ? { maxFocusDuration: data.maxFocusDuration }
                    : {}),
                ...(data.preferredWorkPattern !== undefined
                    ? { preferredWorkPattern: data.preferredWorkPattern }
                    : {}),
                ...(data.aiPreferences !== undefined
                    ? { aiPreferences: data.aiPreferences }
                    : {}),
            },
        }, { new: true, upsert: true }).exec();
        return habit;
    },
    addCompletionHistory: async (userId, history) => {
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        await user_habit_model_1.UserHabit.findOneAndUpdate({ userId: userObjectId }, {
            $push: {
                taskCompletionHistory: {
                    ...history,
                    date: new Date(),
                },
            },
        }, { upsert: true }).exec();
    },
    analyzeProductivity: async (userId) => {
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const habit = await user_habit_model_1.UserHabit.findOne({
            userId: userObjectId,
        }).exec();
        if (!habit || habit.taskCompletionHistory.length === 0) {
            return null;
        }
        // Analyze last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentHistory = habit.taskCompletionHistory.filter((h) => h.date >= thirtyDaysAgo);
        if (recentHistory.length === 0) {
            return null;
        }
        // Count completions by hour
        const hourStats = {};
        recentHistory.forEach((h) => {
            if (!hourStats[h.hour]) {
                hourStats[h.hour] = { completed: 0, total: 0 };
            }
            hourStats[h.hour].total++;
            if (h.completed) {
                hourStats[h.hour].completed++;
            }
        });
        // Find most productive hours (>70% completion rate)
        const productiveHours = Object.entries(hourStats)
            .filter(([_, stats]) => stats.completed / stats.total > 0.7)
            .map(([hour]) => Number(hour))
            .sort((a, b) => a - b);
        // Overall completion rate
        const totalCompleted = recentHistory.filter((h) => h.completed).length;
        const completionRate = totalCompleted / recentHistory.length;
        return {
            mostProductiveHours: productiveHours,
            completionRate,
            pattern: habit.preferredWorkPattern,
        };
    },
};
