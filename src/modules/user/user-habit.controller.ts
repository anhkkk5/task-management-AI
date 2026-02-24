import { Request, Response } from "express";
import { userHabitRepository } from "./user-habit.repository";

const getUserId = (req: Request): string | null => {
  const userId = (req as any).user?.userId;
  return userId ? String(userId) : null;
};

export const getUserHabits = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const habits = await userHabitRepository.findByUserId(userId);
    const analysis = await userHabitRepository.analyzeProductivity(userId);

    res.status(200).json({
      habits: habits || null,
      analysis,
    });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateUserHabits = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const body = (req as any).body || {};

    const habits = await userHabitRepository.createOrUpdate(userId, {
      productiveHours: body.productiveHours,
      preferredBreakDuration: body.preferredBreakDuration,
      maxFocusDuration: body.maxFocusDuration,
      preferredWorkPattern: body.preferredWorkPattern,
      aiPreferences: body.aiPreferences,
    });

    res.status(200).json({ habits });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const trackTaskCompletion = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const body = (req as any).body || {};
    const { hour, dayOfWeek, completed, duration } = body;

    if (hour === undefined || dayOfWeek === undefined || completed === undefined) {
      res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      return;
    }

    await userHabitRepository.addCompletionHistory(userId, {
      hour: Number(hour),
      dayOfWeek: Number(dayOfWeek),
      completed: Boolean(completed),
      duration: Number(duration) || 0,
    });

    res.status(200).json({ message: "Đã ghi nhận" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
