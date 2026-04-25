"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiScheduleService = exports.AIScheduleService = void 0;
const ai_schedule_repository_1 = require("./ai-schedule.repository");
const task_model_1 = require("../task/task.model");
const mongoose_1 = require("mongoose");
class AIScheduleService {
    async loadExistingTaskIds(userId) {
        const tasks = await task_model_1.Task.find({ userId: new mongoose_1.Types.ObjectId(userId) }, { _id: 1 }).lean();
        return new Set(tasks.map((t) => String(t._id)));
    }
    pruneScheduleOrphans(schedule, existingTaskIds) {
        let modified = false;
        const nextDays = schedule.schedule
            .map((day) => {
            const beforeCount = day.tasks.length;
            const keptTasks = day.tasks.filter((session) => existingTaskIds.has(String(session.taskId)));
            if (keptTasks.length !== beforeCount) {
                modified = true;
            }
            return {
                ...day,
                tasks: keptTasks,
            };
        })
            .filter((day) => day.tasks.length > 0);
        if (nextDays.length !== schedule.schedule.length) {
            modified = true;
        }
        const nextSourceTasks = (schedule.sourceTasks || []).filter((taskId) => existingTaskIds.has(String(taskId)));
        if (nextSourceTasks.length !== (schedule.sourceTasks || []).length) {
            modified = true;
        }
        if (!modified)
            return false;
        schedule.schedule = nextDays;
        schedule.sourceTasks = nextSourceTasks;
        if (nextDays.length === 0 && schedule.isActive) {
            schedule.isActive = false;
        }
        schedule.markModified("schedule");
        schedule.markModified("sourceTasks");
        if (!schedule.isActive) {
            schedule.markModified("isActive");
        }
        return true;
    }
    parseTimeRange(timeRange) {
        const m = String(timeRange)
            .trim()
            .match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
        if (!m)
            return null;
        const [, sh, sm, eh, em] = m;
        const startHour = parseInt(sh, 10);
        const startMinute = parseInt(sm, 10);
        const endHour = parseInt(eh, 10);
        const endMinute = parseInt(em, 10);
        if (Number.isNaN(startHour) ||
            Number.isNaN(startMinute) ||
            Number.isNaN(endHour) ||
            Number.isNaN(endMinute) ||
            startHour < 0 ||
            startHour > 23 ||
            endHour < 0 ||
            endHour > 23 ||
            startMinute < 0 ||
            startMinute > 59 ||
            endMinute < 0 ||
            endMinute > 59) {
            return null;
        }
        const startTotal = startHour * 60 + startMinute;
        const endTotal = endHour * 60 + endMinute;
        if (endTotal <= startTotal)
            return null;
        return { startHour, startMinute, endHour, endMinute };
    }
    buildDateTime(dateStr, hour, minute) {
        const d = new Date(`${dateStr}T00:00:00`);
        d.setHours(hour, minute, 0, 0);
        return d;
    }
    dayLabelVi(date) {
        const labels = [
            "Chủ Nhật",
            "Thứ Hai",
            "Thứ Ba",
            "Thứ Tư",
            "Thứ Năm",
            "Thứ Sáu",
            "Thứ Bảy",
        ];
        return labels[date.getDay()] || "";
    }
    async getUserSchedules(userId) {
        const schedules = await ai_schedule_repository_1.aiScheduleRepository.findByUserId(userId);
        return schedules.map((s) => this.toResponse(s));
    }
    async getActiveSchedule(userId) {
        const schedules = await ai_schedule_repository_1.aiScheduleRepository.findAllActiveByUserId(userId);
        if (schedules.length === 0)
            return null;
        const existingTaskIds = await this.loadExistingTaskIds(userId);
        const activeSchedules = [];
        for (const schedule of schedules) {
            const changed = this.pruneScheduleOrphans(schedule, existingTaskIds);
            if (changed) {
                await schedule.save();
            }
            if (schedule.isActive &&
                Array.isArray(schedule.schedule) &&
                schedule.schedule.length > 0) {
                activeSchedules.push(schedule);
            }
        }
        if (activeSchedules.length === 0)
            return null;
        if (activeSchedules.length === 1)
            return this.toResponse(activeSchedules[0]);
        const dayMap = new Map();
        const allSuggestedOrder = [];
        const allSourceTasks = [];
        for (const s of activeSchedules) {
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
        const base = this.toResponse(activeSchedules[0]);
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
    async updateSessionTime(scheduleId, userId, sessionId, suggestedTime, targetDate) {
        const parsedNew = this.parseTimeRange(suggestedTime);
        if (!parsedNew) {
            throw new Error("INVALID_SUGGESTED_TIME");
        }
        const schedule = await ai_schedule_repository_1.aiScheduleRepository.findByIdAndUserId(scheduleId, userId);
        if (!schedule)
            return null;
        let fromDayIndex = -1;
        let fromTaskIndex = -1;
        for (let i = 0; i < schedule.schedule.length; i++) {
            const taskIdx = schedule.schedule[i].tasks.findIndex((t) => t.sessionId === sessionId);
            if (taskIdx >= 0) {
                fromDayIndex = i;
                fromTaskIndex = taskIdx;
                break;
            }
        }
        if (fromDayIndex < 0 || fromTaskIndex < 0) {
            return null;
        }
        const fromDay = schedule.schedule[fromDayIndex];
        if (!fromDay) {
            return null;
        }
        const originalSession = fromDay.tasks[fromTaskIndex];
        if (!originalSession) {
            return null;
        }
        const originalParsed = this.parseTimeRange(originalSession.suggestedTime);
        if (!originalParsed) {
            throw new Error("INVALID_ORIGINAL_SESSION_TIME");
        }
        const originalStart = this.buildDateTime(fromDay.date, originalParsed.startHour, originalParsed.startMinute);
        const now = new Date();
        // Chỉ cho move session chưa tới giờ bắt đầu
        if (originalStart.getTime() <= now.getTime()) {
            throw new Error("SESSION_ALREADY_STARTED");
        }
        const moveDate = String(targetDate || fromDay.date).trim();
        const dayDate = new Date(`${moveDate}T00:00:00`);
        if (Number.isNaN(dayDate.getTime())) {
            throw new Error("INVALID_TARGET_DATE");
        }
        const nextStart = this.buildDateTime(moveDate, parsedNew.startHour, parsedNew.startMinute);
        // Không cho move về quá khứ so với thời gian thực
        if (nextStart.getTime() < now.getTime()) {
            throw new Error("TARGET_TIME_IN_PAST");
        }
        if (moveDate === fromDay.date) {
            schedule.schedule[fromDayIndex].tasks[fromTaskIndex].suggestedTime =
                suggestedTime;
        }
        else {
            // Remove from old day
            schedule.schedule[fromDayIndex].tasks.splice(fromTaskIndex, 1);
            // Add to target day (create if missing)
            let targetDay = schedule.schedule.find((d) => d.date === moveDate);
            if (!targetDay) {
                const newTargetDay = {
                    day: this.dayLabelVi(dayDate),
                    date: moveDate,
                    tasks: [],
                };
                schedule.schedule.push(newTargetDay);
                targetDay = newTargetDay;
            }
            if (!targetDay) {
                return null;
            }
            targetDay.tasks.push({
                ...originalSession,
                suggestedTime,
            });
        }
        // Keep day tasks sorted by start time
        schedule.schedule.forEach((day) => {
            day.tasks.sort((a, b) => {
                const ta = this.parseTimeRange(a.suggestedTime);
                const tb = this.parseTimeRange(b.suggestedTime);
                const ma = ta ? ta.startHour * 60 + ta.startMinute : 0;
                const mb = tb ? tb.startHour * 60 + tb.startMinute : 0;
                return ma - mb;
            });
        });
        schedule.schedule.sort((a, b) => String(a.date).localeCompare(String(b.date)));
        schedule.markModified("schedule");
        await schedule.save();
        return this.toResponse(schedule);
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
                "scheduledTime.start": { $exists: false },
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
            "scheduledTime.start": { $exists: false },
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
