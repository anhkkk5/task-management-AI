"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskRepository = void 0;
const mongoose_1 = require("mongoose");
const task_model_1 = require("./task.model");
exports.taskRepository = {
    create: async (attrs) => {
        return task_model_1.Task.create({
            title: attrs.title,
            description: attrs.description,
            type: attrs.type,
            allDay: attrs.allDay,
            guests: attrs.guests ?? [],
            location: attrs.location,
            visibility: attrs.visibility,
            reminderMinutes: attrs.reminderMinutes,
            recurrence: attrs.recurrence,
            meetingLink: attrs.meetingLink,
            status: attrs.status ?? "todo",
            priority: attrs.priority ?? "medium",
            deadline: attrs.deadline,
            tags: attrs.tags ?? [],
            userId: attrs.userId,
            parentTaskId: attrs.parentTaskId,
            aiBreakdown: attrs.aiBreakdown ?? [],
            estimatedDuration: attrs.estimatedDuration,
            dailyTargetDuration: attrs.dailyTargetDuration,
            dailyTargetMin: attrs.dailyTargetMin,
            reminderAt: attrs.reminderAt,
            scheduledTime: attrs.scheduledTime,
        });
    },
    findById: async (taskId) => {
        return task_model_1.Task.findById(taskId).exec();
    },
    findByIdForUser: async (params) => {
        return task_model_1.Task.findOne({ _id: params.taskId, userId: params.userId }).exec();
    },
    updateById: async (taskId, update) => {
        return task_model_1.Task.findByIdAndUpdate(taskId, {
            $set: {
                ...(update.title !== undefined ? { title: update.title } : {}),
                ...(update.description !== undefined
                    ? { description: update.description }
                    : {}),
                ...(update.type !== undefined ? { type: update.type } : {}),
                ...(update.allDay !== undefined ? { allDay: update.allDay } : {}),
                ...(update.guests !== undefined ? { guests: update.guests } : {}),
                ...(update.location !== undefined
                    ? { location: update.location }
                    : {}),
                ...(update.visibility !== undefined
                    ? { visibility: update.visibility }
                    : {}),
                ...(update.reminderMinutes !== undefined
                    ? { reminderMinutes: update.reminderMinutes }
                    : {}),
                ...(update.recurrence !== undefined
                    ? { recurrence: update.recurrence }
                    : {}),
                ...(update.meetingLink !== undefined
                    ? { meetingLink: update.meetingLink }
                    : {}),
                ...(update.status !== undefined ? { status: update.status } : {}),
                ...(update.priority !== undefined
                    ? { priority: update.priority }
                    : {}),
                ...(update.deadline !== undefined
                    ? { deadline: update.deadline }
                    : {}),
                ...(update.tags !== undefined ? { tags: update.tags } : {}),
                ...(update.reminderAt !== undefined
                    ? { reminderAt: update.reminderAt }
                    : {}),
                ...(update.aiBreakdown !== undefined
                    ? { aiBreakdown: update.aiBreakdown }
                    : {}),
                ...(update.estimatedDuration !== undefined
                    ? { estimatedDuration: update.estimatedDuration }
                    : {}),
                ...(update.dailyTargetDuration !== undefined
                    ? { dailyTargetDuration: update.dailyTargetDuration }
                    : {}),
                ...(update.dailyTargetMin !== undefined
                    ? { dailyTargetMin: update.dailyTargetMin }
                    : {}),
                ...(update.scheduledTime !== undefined
                    ? { scheduledTime: update.scheduledTime }
                    : {}),
            },
        }, { new: true }).exec();
    },
    updateByIdForUser: async (params, update) => {
        return task_model_1.Task.findOneAndUpdate({ _id: params.taskId, userId: params.userId }, {
            $set: {
                ...(update.title !== undefined ? { title: update.title } : {}),
                ...(update.description !== undefined
                    ? { description: update.description }
                    : {}),
                ...(update.type !== undefined ? { type: update.type } : {}),
                ...(update.allDay !== undefined ? { allDay: update.allDay } : {}),
                ...(update.guests !== undefined ? { guests: update.guests } : {}),
                ...(update.location !== undefined
                    ? { location: update.location }
                    : {}),
                ...(update.visibility !== undefined
                    ? { visibility: update.visibility }
                    : {}),
                ...(update.reminderMinutes !== undefined
                    ? { reminderMinutes: update.reminderMinutes }
                    : {}),
                ...(update.recurrence !== undefined
                    ? { recurrence: update.recurrence }
                    : {}),
                ...(update.meetingLink !== undefined
                    ? { meetingLink: update.meetingLink }
                    : {}),
                ...(update.status !== undefined ? { status: update.status } : {}),
                ...(update.priority !== undefined
                    ? { priority: update.priority }
                    : {}),
                ...(update.deadline !== undefined
                    ? { deadline: update.deadline }
                    : {}),
                ...(update.tags !== undefined ? { tags: update.tags } : {}),
                ...(update.reminderAt !== undefined
                    ? { reminderAt: update.reminderAt }
                    : {}),
                ...(update.aiBreakdown !== undefined
                    ? { aiBreakdown: update.aiBreakdown }
                    : {}),
                ...(update.estimatedDuration !== undefined
                    ? { estimatedDuration: update.estimatedDuration }
                    : {}),
                ...(update.dailyTargetDuration !== undefined
                    ? { dailyTargetDuration: update.dailyTargetDuration }
                    : {}),
                ...(update.dailyTargetMin !== undefined
                    ? { dailyTargetMin: update.dailyTargetMin }
                    : {}),
                ...(update.scheduledTime !== undefined
                    ? { scheduledTime: update.scheduledTime }
                    : {}),
            },
        }, { new: true }).exec();
    },
    deleteById: async (taskId) => {
        return task_model_1.Task.findByIdAndDelete(taskId).exec();
    },
    deleteByIdForUser: async (params) => {
        return task_model_1.Task.findOneAndDelete({
            _id: params.taskId,
            userId: params.userId,
        }).exec();
    },
    listByUser: async (params) => {
        const filter = {
            userId: params.userId,
            isArchived: { $ne: true },
        };
        if (params.status) {
            filter.status = params.status;
        }
        if (params.priority) {
            filter.priority = params.priority;
        }
        if (params.title) {
            filter.title = params.title;
        }
        if (params.deadlineFrom || params.deadlineTo) {
            filter.deadline = {
                ...(params.deadlineFrom ? { $gte: params.deadlineFrom } : {}),
                ...(params.deadlineTo ? { $lte: params.deadlineTo } : {}),
            };
        }
        const skip = (params.page - 1) * params.limit;
        const [items, total] = await Promise.all([
            task_model_1.Task.find(filter)
                .sort({ deadline: 1, updatedAt: -1 })
                .skip(skip)
                .limit(params.limit)
                .exec(),
            task_model_1.Task.countDocuments(filter).exec(),
        ]);
        return { items, total };
    },
    listOverdueByUser: async (params) => {
        const filter = {
            userId: params.userId,
            deadline: { $lt: params.now },
            status: { $nin: ["completed", "cancelled"] },
            isArchived: { $ne: true },
        };
        const skip = (params.page - 1) * params.limit;
        const [items, total] = await Promise.all([
            task_model_1.Task.find(filter)
                .sort({ deadline: 1, updatedAt: -1 })
                .skip(skip)
                .limit(params.limit)
                .exec(),
            task_model_1.Task.countDocuments(filter).exec(),
        ]);
        return { items, total };
    },
    // Find tasks with overlapping scheduled time
    findConflictingTasks: async (params) => {
        const filter = {
            userId: params.userId,
            "scheduledTime.start": { $exists: true, $ne: null },
            "scheduledTime.end": { $exists: true, $ne: null },
            status: { $nin: ["completed", "cancelled"] },
        };
        // Exclude specific task if provided (for update scenario)
        if (params.excludeTaskId) {
            filter._id = { $ne: new mongoose_1.Types.ObjectId(params.excludeTaskId) };
        }
        // Find tasks where scheduled time overlaps with the given time range
        // Overlap condition: (taskStart < givenEnd) AND (taskEnd > givenStart)
        filter.$and = [
            { "scheduledTime.start": { $lt: params.endTime } },
            { "scheduledTime.end": { $gt: params.startTime } },
        ];
        return task_model_1.Task.find(filter).exec();
    },
    // Get scheduled tasks for conflict detection
    getScheduledTasks: async (params) => {
        const filter = {
            userId: params.userId,
            status: { $in: ["scheduled", "in_progress"] },
            "scheduledTime.start": { $exists: true, $ne: null },
            "scheduledTime.end": { $exists: true, $ne: null },
            // Task phải overlap với range [startDate, endDate]
            // Overlap condition: taskStart < endDate AND taskEnd > startDate
            $and: [
                { "scheduledTime.start": { $lt: params.endDate } },
                { "scheduledTime.end": { $gt: params.startDate } },
            ],
        };
        // Exclude specific tasks (e.g., tasks being scheduled)
        if (params.excludeTaskIds && params.excludeTaskIds.length > 0) {
            filter._id = {
                $nin: params.excludeTaskIds.map((id) => new mongoose_1.Types.ObjectId(id)),
            };
        }
        return task_model_1.Task.find(filter).sort({ "scheduledTime.start": 1 }).exec();
    },
};
