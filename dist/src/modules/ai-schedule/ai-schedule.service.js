"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiScheduleService = exports.AIScheduleService = void 0;
const ai_schedule_repository_1 = require("./ai-schedule.repository");
const task_model_1 = require("../task/task.model");
const mongoose_1 = require("mongoose");
class AIScheduleService {
    async getUserSchedules(userId) {
        const schedules = await ai_schedule_repository_1.aiScheduleRepository.findByUserId(userId);
        return schedules.map((s) => this.toResponse(s));
    }
    async getActiveSchedule(userId) {
        const schedules = await ai_schedule_repository_1.aiScheduleRepository.findAllActiveByUserId(userId);
        if (schedules.length === 0)
            return null;
        if (schedules.length === 1)
            return this.toResponse(schedules[0]);
        const dayMap = new Map();
        const allSuggestedOrder = [];
        const allSourceTasks = [];
        for (const s of schedules) {
            const res = this.toResponse(s);
            if (Array.isArray(res.suggestedOrder)) {
                allSuggestedOrder.push(...res.suggestedOrder);
            }
            if (Array.isArray(res.sourceTasks)) {
                allSourceTasks.push(...res.sourceTasks);
            }
            for (const d of res.schedule) {
                const date = String(d.date);
                if (!dayMap.has(date)) {
                    dayMap.set(date, {
                        day: d.day,
                        date: d.date,
                        tasks: [],
                        note: d.note,
                    });
                }
                dayMap
                    .get(date)
                    .tasks.push(...d.tasks.map((t) => ({ ...t, scheduleId: res.id })));
            }
        }
        const mergedSchedule = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
        const base = this.toResponse(schedules[0]);
        return {
            ...base,
            schedule: mergedSchedule,
            suggestedOrder: Array.from(new Set(allSuggestedOrder)),
            sourceTasks: Array.from(new Set(allSourceTasks)),
            isActive: true,
        };
    }
    async getScheduleById(scheduleId, userId) {
        const schedule = await ai_schedule_repository_1.aiScheduleRepository.findByIdAndUserId(scheduleId, userId);
        return schedule ? this.toResponse(schedule) : null;
    }
    async createSchedule(userId, input) {
        // KHÔNG deactivate existing schedules - preserve tất cả tasks đã scheduled
        // Mỗi schedule mới sẽ được merge với existing schedules
        const schedule = await ai_schedule_repository_1.aiScheduleRepository.create(userId, {
            ...input,
            isActive: true,
            appliedAt: new Date(),
        });
        return this.toResponse(schedule);
    }
    async updateSessionStatus(scheduleId, userId, input) {
        const updated = await ai_schedule_repository_1.aiScheduleRepository.updateSessionStatus(scheduleId, userId, input.sessionId, input.status);
        return updated ? this.toResponse(updated) : null;
    }
    async updateSessionTime(scheduleId, userId, sessionId, suggestedTime) {
        const updated = await ai_schedule_repository_1.aiScheduleRepository.updateSessionTime(scheduleId, userId, sessionId, suggestedTime);
        return updated ? this.toResponse(updated) : null;
    }
    async deleteSession(scheduleId, userId, sessionId) {
        const updated = await ai_schedule_repository_1.aiScheduleRepository.deleteSession(scheduleId, userId, sessionId);
        return updated ? this.toResponse(updated) : null;
    }
    async deleteSchedule(scheduleId, userId) {
        const deleted = await ai_schedule_repository_1.aiScheduleRepository.delete(scheduleId, userId);
        if (deleted) {
            await task_model_1.Task.deleteMany({
                userId: new mongoose_1.Types.ObjectId(userId),
                "scheduledTime.aiPlanned": true,
                parentTaskId: { $exists: true },
            });
            await task_model_1.Task.updateMany({
                userId: new mongoose_1.Types.ObjectId(userId),
                status: "scheduled",
                "scheduledTime.start": { $exists: false }
            }, { $set: { status: "todo" } });
        }
        return deleted;
    }
    async deleteAllUserSchedules(userId) {
        await ai_schedule_repository_1.aiScheduleRepository.deleteAllForUser(userId);
        await task_model_1.Task.deleteMany({
            userId: new mongoose_1.Types.ObjectId(userId),
            "scheduledTime.aiPlanned": true,
            parentTaskId: { $exists: true },
        });
        await task_model_1.Task.updateMany({
            userId: new mongoose_1.Types.ObjectId(userId),
            status: "scheduled",
            "scheduledTime.start": { $exists: false }
        }, { $set: { status: "todo" } });
    }
    toResponse(schedule) {
        return {
            id: schedule._id.toString(),
            name: schedule.name,
            description: schedule.description,
            schedule: schedule.schedule.map((day) => ({
                day: day.day,
                date: day.date,
                tasks: day.tasks.map((task) => ({
                    sessionId: task.sessionId,
                    taskId: task.taskId,
                    title: task.title,
                    priority: task.priority,
                    suggestedTime: task.suggestedTime,
                    reason: task.reason,
                    status: task.status,
                    createSubtask: task.createSubtask,
                })),
                note: day.note,
            })),
            suggestedOrder: schedule.suggestedOrder,
            personalizationNote: schedule.personalizationNote,
            totalEstimatedTime: schedule.totalEstimatedTime,
            splitStrategy: schedule.splitStrategy,
            confidenceScore: schedule.confidenceScore,
            sourceTasks: schedule.sourceTasks,
            isActive: schedule.isActive,
            appliedAt: schedule.appliedAt,
            createdAt: schedule.createdAt,
            updatedAt: schedule.updatedAt,
        };
    }
}
exports.AIScheduleService = AIScheduleService;
exports.aiScheduleService = new AIScheduleService();
