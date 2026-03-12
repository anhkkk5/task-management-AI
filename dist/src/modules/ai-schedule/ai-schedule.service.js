"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiScheduleService = exports.AIScheduleService = void 0;
const ai_schedule_repository_1 = require("./ai-schedule.repository");
class AIScheduleService {
    async getUserSchedules(userId) {
        const schedules = await ai_schedule_repository_1.aiScheduleRepository.findByUserId(userId);
        return schedules.map((s) => this.toResponse(s));
    }
    async getActiveSchedule(userId) {
        const schedule = await ai_schedule_repository_1.aiScheduleRepository.findActiveByUserId(userId);
        return schedule ? this.toResponse(schedule) : null;
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
    async deleteSchedule(scheduleId, userId) {
        return ai_schedule_repository_1.aiScheduleRepository.delete(scheduleId, userId);
    }
    async deleteAllUserSchedules(userId) {
        await ai_schedule_repository_1.aiScheduleRepository.deleteAllForUser(userId);
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
