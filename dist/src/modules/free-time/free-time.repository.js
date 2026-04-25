"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.freeTimeRepository = exports.FreeTimeRepository = void 0;
const mongoose_1 = require("mongoose");
const free_time_model_1 = require("./free-time.model");
class FreeTimeRepository {
    async findByUserId(userId) {
        return free_time_model_1.FreeTime.findOne({ userId: new mongoose_1.Types.ObjectId(userId) }).exec();
    }
    async upsertWeeklyPattern(userId, weeklyPattern, timezone) {
        const updated = await free_time_model_1.FreeTime.findOneAndUpdate({ userId: new mongoose_1.Types.ObjectId(userId) }, {
            $set: {
                weeklyPattern,
                ...(timezone ? { timezone } : {}),
            },
            $setOnInsert: {
                customDates: [],
            },
        }, { new: true, upsert: true }).exec();
        if (updated)
            return updated;
        return this.findByUserId(userId);
    }
    async upsertCustomDate(userId, date, slots) {
        const base = await free_time_model_1.FreeTime.findOneAndUpdate({ userId: new mongoose_1.Types.ObjectId(userId) }, {
            $setOnInsert: {
                weeklyPattern: {
                    monday: [],
                    tuesday: [],
                    wednesday: [],
                    thursday: [],
                    friday: [],
                    saturday: [],
                    sunday: [],
                },
                customDates: [],
                timezone: "Asia/Ho_Chi_Minh",
            },
        }, { new: true, upsert: true }).exec();
        if (!base)
            return null;
        // remove old date then push latest for idempotent upsert
        base.customDates = (base.customDates || []).filter((x) => x.date !== date);
        base.customDates.push({ date, slots });
        base.markModified("customDates");
        await base.save();
        return base;
    }
    async deleteCustomDate(userId, date) {
        return free_time_model_1.FreeTime.findOneAndUpdate({ userId: new mongoose_1.Types.ObjectId(userId) }, { $pull: { customDates: { date } } }, { new: true }).exec();
    }
}
exports.FreeTimeRepository = FreeTimeRepository;
exports.freeTimeRepository = new FreeTimeRepository();
