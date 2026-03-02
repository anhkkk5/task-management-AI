"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackTaskCompletion = exports.updateUserHabits = exports.getUserHabits = void 0;
const user_habit_repository_1 = require("./user-habit.repository");
const getUserId = (req) => {
    const userId = req.user?.userId;
    return userId ? String(userId) : null;
};
const getUserHabits = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const habits = await user_habit_repository_1.userHabitRepository.findByUserId(userId);
        const analysis = await user_habit_repository_1.userHabitRepository.analyzeProductivity(userId);
        res.status(200).json({
            habits: habits || null,
            analysis,
        });
    }
    catch (err) {
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.getUserHabits = getUserHabits;
const updateUserHabits = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const body = req.body || {};
        const habits = await user_habit_repository_1.userHabitRepository.createOrUpdate(userId, {
            productiveHours: body.productiveHours,
            preferredBreakDuration: body.preferredBreakDuration,
            maxFocusDuration: body.maxFocusDuration,
            preferredWorkPattern: body.preferredWorkPattern,
            aiPreferences: body.aiPreferences,
        });
        res.status(200).json({ habits });
    }
    catch (err) {
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.updateUserHabits = updateUserHabits;
const trackTaskCompletion = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const body = req.body || {};
        const { hour, dayOfWeek, completed, duration } = body;
        if (hour === undefined || dayOfWeek === undefined || completed === undefined) {
            res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
            return;
        }
        await user_habit_repository_1.userHabitRepository.addCompletionHistory(userId, {
            hour: Number(hour),
            dayOfWeek: Number(dayOfWeek),
            completed: Boolean(completed),
            duration: Number(duration) || 0,
        });
        res.status(200).json({ message: "Đã ghi nhận" });
    }
    catch (err) {
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.trackTaskCompletion = trackTaskCompletion;
