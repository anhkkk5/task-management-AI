"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleTemplateRepository = void 0;
const schedule_template_model_1 = require("./schedule-template.model");
exports.scheduleTemplateRepository = {
    // Create new template
    create: async (attrs) => {
        return schedule_template_model_1.ScheduleTemplate.create({
            userId: attrs.userId,
            name: attrs.name,
            description: attrs.description,
            pattern: attrs.pattern,
            isDefault: attrs.isDefault ?? false,
            tags: attrs.tags ?? [],
            usageCount: 0,
        });
    },
    // Find by ID
    findById: async (templateId) => {
        return schedule_template_model_1.ScheduleTemplate.findById(templateId).exec();
    },
    // Find by ID for user (ownership check)
    findByIdForUser: async (params) => {
        return schedule_template_model_1.ScheduleTemplate.findOne({
            _id: params.templateId,
            userId: params.userId,
        }).exec();
    },
    // List templates for user
    listByUser: async (params) => {
        const filter = {
            userId: params.userId,
        };
        if (params.tag) {
            filter.tags = params.tag;
        }
        return schedule_template_model_1.ScheduleTemplate.find(filter)
            .sort({ isDefault: -1, usageCount: -1, createdAt: -1 })
            .limit(params.limit ?? 20)
            .exec();
    },
    // Get default template for user
    getDefaultForUser: async (userId) => {
        return schedule_template_model_1.ScheduleTemplate.findOne({
            userId,
            isDefault: true,
        }).exec();
    },
    // Update template
    updateByIdForUser: async (params, update) => {
        return schedule_template_model_1.ScheduleTemplate.findOneAndUpdate({ _id: params.templateId, userId: params.userId }, {
            $set: {
                ...(update.name !== undefined ? { name: update.name } : {}),
                ...(update.description !== undefined
                    ? { description: update.description }
                    : {}),
                ...(update.pattern !== undefined ? { pattern: update.pattern } : {}),
                ...(update.isDefault !== undefined
                    ? { isDefault: update.isDefault }
                    : {}),
                ...(update.tags !== undefined ? { tags: update.tags } : {}),
            },
        }, { new: true }).exec();
    },
    // Delete template
    deleteByIdForUser: async (params) => {
        return schedule_template_model_1.ScheduleTemplate.findOneAndDelete({
            _id: params.templateId,
            userId: params.userId,
        }).exec();
    },
    // Increment usage count
    incrementUsageCount: async (templateId) => {
        await schedule_template_model_1.ScheduleTemplate.findByIdAndUpdate(templateId, {
            $inc: { usageCount: 1 },
        }).exec();
    },
    // Set as default (and unset other defaults for same user)
    setAsDefault: async (params) => {
        // Unset current default
        await schedule_template_model_1.ScheduleTemplate.updateMany({ userId: params.userId, isDefault: true }, { $set: { isDefault: false } });
        // Set new default
        const result = await schedule_template_model_1.ScheduleTemplate.findOneAndUpdate({ _id: params.templateId, userId: params.userId }, { $set: { isDefault: true } });
        return !!result;
    },
};
