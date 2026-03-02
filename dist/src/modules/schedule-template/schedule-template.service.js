"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleTemplateService = void 0;
const mongoose_1 = require("mongoose");
const schedule_template_repository_1 = require("./schedule-template.repository");
const toPublicTemplate = (doc) => {
    return {
        id: String(doc._id),
        name: doc.name,
        description: doc.description,
        pattern: doc.pattern,
        isDefault: doc.isDefault,
        tags: doc.tags,
        usageCount: doc.usageCount,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
};
exports.scheduleTemplateService = {
    // Create template from AI schedule
    createFromSchedule: async (userId, data) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        // Analyze schedule to extract pattern
        const dayPatterns = new Map();
        for (const day of data.aiSchedule.schedule) {
            // Determine day of week from date
            const date = new Date(day.date);
            const dayOfWeek = date.getDay();
            if (!dayPatterns.has(dayOfWeek)) {
                dayPatterns.set(dayOfWeek, []);
            }
            const existing = dayPatterns.get(dayOfWeek);
            if (existing) {
                existing.push(...day.tasks);
            }
        }
        // Build pattern structure
        const patternDays = Array.from(dayPatterns.entries()).map(([dayOfWeek, tasks]) => {
            const timeBlocks = tasks.map((task) => {
                const [startTime, endTime] = task.suggestedTime.split(" - ");
                return {
                    startTime: startTime.trim(),
                    endTime: endTime.trim(),
                    label: `${task.priority === "high" || task.priority === "urgent" ? "[Quan trọng] " : ""}${task.title}`,
                    breakDuration: 15,
                };
            });
            return {
                dayOfWeek,
                timeBlocks,
            };
        });
        const doc = await schedule_template_repository_1.scheduleTemplateRepository.create({
            userId: new mongoose_1.Types.ObjectId(userId),
            name: data.name,
            description: data.description,
            pattern: {
                days: patternDays,
                aiConfig: {
                    preferredWorkPattern: "mixed",
                    maxTasksPerDay: 5,
                    minBreakBetweenTasks: 15,
                },
            },
            tags: data.tags ?? ["ai-generated"],
        });
        return toPublicTemplate(doc);
    },
    // Create manual template
    create: async (userId, data) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        // If setting as default, unset current default first
        if (data.isDefault) {
            const existingDefault = await schedule_template_repository_1.scheduleTemplateRepository.getDefaultForUser(new mongoose_1.Types.ObjectId(userId));
            if (existingDefault) {
                await schedule_template_repository_1.scheduleTemplateRepository.updateByIdForUser({ templateId: existingDefault._id, userId: new mongoose_1.Types.ObjectId(userId) }, { isDefault: false });
            }
        }
        const doc = await schedule_template_repository_1.scheduleTemplateRepository.create({
            userId: new mongoose_1.Types.ObjectId(userId),
            name: data.name,
            description: data.description,
            pattern: data.pattern,
            isDefault: data.isDefault ?? false,
            tags: data.tags ?? [],
        });
        return toPublicTemplate(doc);
    },
    // Get template by ID
    getById: async (userId, templateId) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId) || !mongoose_1.Types.ObjectId.isValid(templateId)) {
            throw new Error("ID_INVALID");
        }
        const doc = await schedule_template_repository_1.scheduleTemplateRepository.findByIdForUser({
            templateId,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!doc) {
            throw new Error("TEMPLATE_NOT_FOUND");
        }
        return toPublicTemplate(doc);
    },
    // List templates
    list: async (userId, options = {}) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const docs = await schedule_template_repository_1.scheduleTemplateRepository.listByUser({
            userId: new mongoose_1.Types.ObjectId(userId),
            tag: options.tag,
            limit: options.limit,
        });
        return docs.map(toPublicTemplate);
    },
    // Get default template
    getDefault: async (userId) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("USER_ID_INVALID");
        }
        const doc = await schedule_template_repository_1.scheduleTemplateRepository.getDefaultForUser(new mongoose_1.Types.ObjectId(userId));
        return doc ? toPublicTemplate(doc) : null;
    },
    // Update template
    update: async (userId, templateId, data) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId) || !mongoose_1.Types.ObjectId.isValid(templateId)) {
            throw new Error("ID_INVALID");
        }
        // If setting as default, unset current default first
        if (data.isDefault) {
            const existingDefault = await schedule_template_repository_1.scheduleTemplateRepository.getDefaultForUser(new mongoose_1.Types.ObjectId(userId));
            if (existingDefault && String(existingDefault._id) !== templateId) {
                await schedule_template_repository_1.scheduleTemplateRepository.updateByIdForUser({ templateId: existingDefault._id, userId: new mongoose_1.Types.ObjectId(userId) }, { isDefault: false });
            }
        }
        const doc = await schedule_template_repository_1.scheduleTemplateRepository.updateByIdForUser({ templateId, userId: new mongoose_1.Types.ObjectId(userId) }, data);
        if (!doc) {
            throw new Error("TEMPLATE_NOT_FOUND");
        }
        return toPublicTemplate(doc);
    },
    // Delete template
    delete: async (userId, templateId) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId) || !mongoose_1.Types.ObjectId.isValid(templateId)) {
            throw new Error("ID_INVALID");
        }
        const deleted = await schedule_template_repository_1.scheduleTemplateRepository.deleteByIdForUser({
            templateId,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!deleted) {
            throw new Error("TEMPLATE_NOT_FOUND");
        }
        return { message: "Xóa template thành công" };
    },
    // Apply template (increment usage count)
    apply: async (userId, templateId) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId) || !mongoose_1.Types.ObjectId.isValid(templateId)) {
            throw new Error("ID_INVALID");
        }
        const doc = await schedule_template_repository_1.scheduleTemplateRepository.findByIdForUser({
            templateId,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!doc) {
            throw new Error("TEMPLATE_NOT_FOUND");
        }
        await schedule_template_repository_1.scheduleTemplateRepository.incrementUsageCount(templateId);
        return {
            template: toPublicTemplate(doc),
            message: "Áp dụng template thành công",
        };
    },
    // Set as default
    setDefault: async (userId, templateId) => {
        if (!mongoose_1.Types.ObjectId.isValid(userId) || !mongoose_1.Types.ObjectId.isValid(templateId)) {
            throw new Error("ID_INVALID");
        }
        const success = await schedule_template_repository_1.scheduleTemplateRepository.setAsDefault({
            templateId,
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        if (!success) {
            throw new Error("TEMPLATE_NOT_FOUND");
        }
        return { message: "Đã đặt template mặc định" };
    },
};
