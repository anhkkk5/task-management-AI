"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiScheduleRepository = exports.AIScheduleRepository = void 0;
const ai_schedule_model_1 = require("./ai-schedule.model");
const mongoose_1 = require("mongoose");
class AIScheduleRepository {
    async findByUserId(userId) {
        return ai_schedule_model_1.AISchedule.find({ userId: new mongoose_1.Types.ObjectId(userId) })
            .sort({ createdAt: -1 })
            .exec();
    }
    async findAllActiveByUserId(userId) {
        return ai_schedule_model_1.AISchedule.find({
            userId: new mongoose_1.Types.ObjectId(userId),
            isActive: true,
        })
            .sort({ createdAt: -1 })
            .exec();
    }
    async findActiveByUserId(userId) {
        return ai_schedule_model_1.AISchedule.findOne({
            userId: new mongoose_1.Types.ObjectId(userId),
            isActive: true,
        })
            .sort({ createdAt: -1 })
            .exec();
    }
    async findById(id) {
        return ai_schedule_model_1.AISchedule.findById(id).exec();
    }
    async findByIdAndUserId(id, userId) {
        return ai_schedule_model_1.AISchedule.findOne({
            _id: new mongoose_1.Types.ObjectId(id),
            userId: new mongoose_1.Types.ObjectId(userId),
        }).exec();
    }
    async create(userId, data) {
        const schedule = new ai_schedule_model_1.AISchedule({
            ...data,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        return schedule.save();
    }
    async update(id, userId, data) {
        return ai_schedule_model_1.AISchedule.findOneAndUpdate({ _id: new mongoose_1.Types.ObjectId(id), userId: new mongoose_1.Types.ObjectId(userId) }, { $set: data }, { new: true }).exec();
    }
    async deleteSession(scheduleId, userId, sessionId) {
        return ai_schedule_model_1.AISchedule.findOneAndUpdate({
            _id: new mongoose_1.Types.ObjectId(scheduleId),
            userId: new mongoose_1.Types.ObjectId(userId),
        }, {
            $pull: { "schedule.$[day].tasks": { sessionId } },
        }, {
            new: true,
            arrayFilters: [{ "day.tasks": { $elemMatch: { sessionId } } }],
        }).exec();
    }
    async updateSessionStatus(scheduleId, userId, sessionId, status) {
        // ✅ FIX: Query nested array đúng cách với 2 cấp arrayFilters
        return ai_schedule_model_1.AISchedule.findOneAndUpdate({
            _id: new mongoose_1.Types.ObjectId(scheduleId),
            userId: new mongoose_1.Types.ObjectId(userId),
        }, {
            $set: { "schedule.$[day].tasks.$[task].status": status },
        }, {
            new: true,
            arrayFilters: [
                { "day.tasks": { $elemMatch: { sessionId } } }, // Filter day chứa session
                { "task.sessionId": sessionId }, // Filter đúng task
            ],
        }).exec();
    }
    async updateSessionTime(scheduleId, userId, sessionId, suggestedTime) {
        // ✅ FIX: Query nested array đúng cách với 2 cấp arrayFilters
        return ai_schedule_model_1.AISchedule.findOneAndUpdate({
            _id: new mongoose_1.Types.ObjectId(scheduleId),
            userId: new mongoose_1.Types.ObjectId(userId),
        }, {
            $set: { "schedule.$[day].tasks.$[task].suggestedTime": suggestedTime },
        }, {
            new: true,
            arrayFilters: [
                { "day.tasks": { $elemMatch: { sessionId } } }, // Filter day chứa session
                { "task.sessionId": sessionId }, // Filter đúng task
            ],
        }).exec();
    }
    async deactivateAllForUser(userId) {
        await ai_schedule_model_1.AISchedule.updateMany({ userId: new mongoose_1.Types.ObjectId(userId), isActive: true }, { $set: { isActive: false } });
    }
    async delete(id, userId) {
        const result = await ai_schedule_model_1.AISchedule.deleteOne({
            _id: new mongoose_1.Types.ObjectId(id),
            userId: new mongoose_1.Types.ObjectId(userId),
        }).exec();
        return result.deletedCount > 0;
    }
    async deleteAllForUser(userId) {
        await ai_schedule_model_1.AISchedule.deleteMany({ userId: new mongoose_1.Types.ObjectId(userId) });
    }
    async updateSessionTitlesForTask(userId, taskId, subtaskTitles) {
        const schedules = await ai_schedule_model_1.AISchedule.find({
            userId: new mongoose_1.Types.ObjectId(userId),
            isActive: true,
            sourceTasks: taskId,
        }).exec();
        for (const schedule of schedules) {
            let slotIndex = 0;
            let modified = false;
            for (const day of schedule.schedule) {
                for (const session of day.tasks) {
                    if (String(session.taskId) === taskId &&
                        slotIndex < subtaskTitles.length) {
                        session.title = subtaskTitles[slotIndex];
                        slotIndex++;
                        modified = true;
                    }
                }
            }
            if (modified) {
                schedule.markModified("schedule");
                await schedule.save();
            }
        }
    }
}
exports.AIScheduleRepository = AIScheduleRepository;
exports.aiScheduleRepository = new AIScheduleRepository();
