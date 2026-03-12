"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulerController = exports.SchedulerController = void 0;
const index_1 = require("./index");
/**
 * API Controller cho Scheduler Module
 * Cung cấp endpoints để test và sử dụng các thuật toán
 */
class SchedulerController {
    /**
     * POST /api/scheduler/check-conflict
     * Kiểm tra task mới có conflict không
     */
    async checkConflict(req, res) {
        try {
            const { newTask, existingTasks } = req.body;
            // Parse dates
            const parsedNewTask = {
                start: new Date(newTask.start),
                end: new Date(newTask.end),
                taskId: newTask.taskId,
            };
            const parsedExisting = existingTasks.map((t) => ({
                start: new Date(t.start),
                end: new Date(t.end),
                taskId: t.taskId,
            }));
            const result = index_1.intervalScheduler.checkConflict(parsedNewTask, parsedExisting);
            res.json({
                success: true,
                data: {
                    hasConflict: result.hasConflict,
                    conflictingTasks: result.conflictingTasks,
                    suggestedNewSlot: result.suggestedNewSlot
                        ? {
                            start: result.suggestedNewSlot.start.toISOString(),
                            end: result.suggestedNewSlot.end.toISOString(),
                        }
                        : null,
                },
            });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    /**
     * POST /api/scheduler/find-free-slots
     * Tìm tất cả slots rảnh trong ngày
     */
    async findFreeSlots(req, res) {
        try {
            const { busySlots, date, minDuration, workHours } = req.body;
            const parsedBusy = busySlots.map((s) => ({
                start: new Date(s.start),
                end: new Date(s.end),
            }));
            const slots = index_1.slotFinder.findFreeSlots({
                busySlots: parsedBusy,
                date: new Date(date),
                minDuration: minDuration || 60,
                workHours: workHours || { start: 8, end: 18 },
            });
            res.json({
                success: true,
                data: slots.map((s) => ({
                    start: s.start.toISOString(),
                    end: s.end.toISOString(),
                    duration: s.duration,
                    productivityScore: s.productivityScore,
                })),
            });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    /**
     * POST /api/scheduler/calculate-productivity
     * Tính điểm productivity cho user
     */
    async calculateProductivity(req, res) {
        try {
            const { completedTasks } = req.body;
            // Input: [{ hour: 9, completed: true, duration: 60 }, ...]
            const scores = index_1.productivityScorer.calculateHourlyScores(completedTasks);
            const result = Array.from(scores.entries()).map(([hourKey, scoreData]) => ({
                hour: hourKey,
                score: scoreData.score,
                confidence: scoreData.confidence,
                sampleSize: scoreData.sampleSize,
            }));
            res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    /**
     * POST /api/scheduler/find-optimal-slot
     * Tìm slot tối ưu cho task
     */
    async findOptimalSlot(req, res) {
        try {
            const { taskDuration, busySlots, date, preferredTimeOfDay, workHours } = req.body;
            const parsedBusy = busySlots.map((s) => ({
                start: new Date(s.start),
                end: new Date(s.end),
            }));
            const slot = index_1.slotFinder.findOptimalSlot({
                taskDuration: taskDuration || 60,
                preferredTimeOfDay,
                busySlots: parsedBusy,
                date: new Date(date),
                workHours: workHours || { start: 8, end: 18 },
            });
            if (!slot) {
                return res.json({
                    success: true,
                    data: null,
                    message: "Không tìm thấy slot phù hợp",
                });
            }
            res.json({
                success: true,
                data: {
                    start: slot.start.toISOString(),
                    end: slot.end.toISOString(),
                    duration: slot.duration,
                    productivityScore: slot.productivityScore,
                },
            });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    /**
     * POST /api/scheduler/schedule-tasks
     * Schedule nhiều tasks theo thuật toán
     */
    async scheduleTasks(req, res) {
        try {
            const { tasks, busySlots, startDate, endDate } = req.body;
            const parsedTasks = tasks.map((t) => ({
                start: new Date(t.start),
                end: new Date(t.end),
                taskId: t.taskId,
                priority: t.priority,
            }));
            const parsedBusy = busySlots.map((s) => ({
                start: new Date(s.start),
                end: new Date(s.end),
            }));
            const scheduled = index_1.intervalScheduler.scheduleTasks(parsedTasks, parsedBusy, new Date(startDate), new Date(endDate));
            res.json({
                success: true,
                data: scheduled.map((s) => ({
                    start: s.start.toISOString(),
                    end: s.end.toISOString(),
                    taskId: s.taskId,
                })),
            });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    /**
     * POST /api/scheduler/find-optimal-hours
     * Tìm giờ tốt nhất cho task profile
     */
    async findOptimalHours(req, res) {
        try {
            const { completedTasks, taskProfile, topN } = req.body;
            const productivityScores = index_1.productivityScorer.calculateHourlyScores(completedTasks);
            const optimalHours = index_1.productivityScorer.findOptimalHours(productivityScores, taskProfile, topN || 3);
            res.json({
                success: true,
                data: optimalHours,
            });
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
exports.SchedulerController = SchedulerController;
exports.schedulerController = new SchedulerController();
