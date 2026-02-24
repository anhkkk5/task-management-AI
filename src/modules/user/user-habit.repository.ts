import { Types } from "mongoose";
import { UserHabit, UserHabitDoc } from "./user-habit.model";

export const userHabitRepository = {
  findByUserId: async (
    userId: string | Types.ObjectId,
  ): Promise<UserHabitDoc | null> => {
    return UserHabit.findOne({ userId }).exec();
  },

  createOrUpdate: async (
    userId: string | Types.ObjectId,
    data: {
      productiveHours?: { start: number; end: number }[];
      preferredBreakDuration?: number;
      maxFocusDuration?: number;
      preferredWorkPattern?: string;
      aiPreferences?: {
        autoBreakdown?: boolean;
        autoSchedule?: boolean;
        prioritizeDeadline?: boolean;
        bufferBetweenTasks?: number;
      };
    },
  ): Promise<UserHabitDoc> => {
    const userObjectId = new Types.ObjectId(userId);

    const habit = await UserHabit.findOneAndUpdate(
      { userId: userObjectId },
      {
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
      },
      { new: true, upsert: true },
    ).exec();

    return habit;
  },

  addCompletionHistory: async (
    userId: string | Types.ObjectId,
    history: {
      hour: number;
      dayOfWeek: number;
      completed: boolean;
      duration: number;
    },
  ): Promise<void> => {
    const userObjectId = new Types.ObjectId(userId);

    await UserHabit.findOneAndUpdate(
      { userId: userObjectId },
      {
        $push: {
          taskCompletionHistory: {
            ...history,
            date: new Date(),
          },
        },
      },
      { upsert: true },
    ).exec();
  },

  analyzeProductivity: async (
    userId: string | Types.ObjectId,
  ): Promise<{
    mostProductiveHours: number[];
    completionRate: number;
    pattern: string;
  } | null> => {
    const userObjectId = new Types.ObjectId(userId);
    const habit = await UserHabit.findOne({
      userId: userObjectId,
    }).exec();

    if (!habit || habit.taskCompletionHistory.length === 0) {
      return null;
    }

    // Analyze last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentHistory = habit.taskCompletionHistory.filter(
      (h) => h.date >= thirtyDaysAgo,
    );

    if (recentHistory.length === 0) {
      return null;
    }

    // Count completions by hour
    const hourStats: Record<number, { completed: number; total: number }> = {};

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
