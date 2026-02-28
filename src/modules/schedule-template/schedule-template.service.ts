import { Types } from "mongoose";
import { scheduleTemplateRepository } from "./schedule-template.repository";
import {
  ScheduleTemplate,
  ScheduleTemplateDoc,
} from "./schedule-template.model";

export type PublicScheduleTemplate = {
  id: string;
  name: string;
  description?: string;
  pattern: {
    days: {
      dayOfWeek: number;
      timeBlocks: {
        startTime: string;
        endTime: string;
        label: string;
        breakDuration?: number;
      }[];
    }[];
    aiConfig?: {
      preferredWorkPattern?: "morning" | "afternoon" | "evening" | "mixed";
      maxTasksPerDay?: number;
      minBreakBetweenTasks?: number;
    };
  };
  isDefault: boolean;
  tags: string[];
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const toPublicTemplate = (doc: ScheduleTemplateDoc): PublicScheduleTemplate => {
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

export const scheduleTemplateService = {
  // Create template from AI schedule
  createFromSchedule: async (
    userId: string,
    data: {
      name: string;
      description?: string;
      aiSchedule: {
        schedule: {
          day: string;
          date: string;
          tasks: {
            taskId: string;
            title: string;
            suggestedTime: string; // "09:00 - 11:00"
            priority: string;
          }[];
        }[];
      };
      tags?: string[];
    },
  ): Promise<PublicScheduleTemplate> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    // Analyze schedule to extract pattern
    const dayPatterns = new Map<number, typeof data.aiSchedule.schedule[0]["tasks"]>();

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

    const doc = await scheduleTemplateRepository.create({
      userId: new Types.ObjectId(userId),
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
  create: async (
    userId: string,
    data: {
      name: string;
      description?: string;
      pattern: PublicScheduleTemplate["pattern"];
      tags?: string[];
      isDefault?: boolean;
    },
  ): Promise<PublicScheduleTemplate> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    // If setting as default, unset current default first
    if (data.isDefault) {
      const existingDefault = await scheduleTemplateRepository.getDefaultForUser(
        new Types.ObjectId(userId),
      );
      if (existingDefault) {
        await scheduleTemplateRepository.updateByIdForUser(
          { templateId: existingDefault._id, userId: new Types.ObjectId(userId) },
          { isDefault: false },
        );
      }
    }

    const doc = await scheduleTemplateRepository.create({
      userId: new Types.ObjectId(userId),
      name: data.name,
      description: data.description,
      pattern: data.pattern,
      isDefault: data.isDefault ?? false,
      tags: data.tags ?? [],
    });

    return toPublicTemplate(doc);
  },

  // Get template by ID
  getById: async (
    userId: string,
    templateId: string,
  ): Promise<PublicScheduleTemplate> => {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(templateId)) {
      throw new Error("ID_INVALID");
    }

    const doc = await scheduleTemplateRepository.findByIdForUser({
      templateId,
      userId: new Types.ObjectId(userId),
    });

    if (!doc) {
      throw new Error("TEMPLATE_NOT_FOUND");
    }

    return toPublicTemplate(doc);
  },

  // List templates
  list: async (
    userId: string,
    options: { tag?: string; limit?: number } = {},
  ): Promise<PublicScheduleTemplate[]> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    const docs = await scheduleTemplateRepository.listByUser({
      userId: new Types.ObjectId(userId),
      tag: options.tag,
      limit: options.limit,
    });

    return docs.map(toPublicTemplate);
  },

  // Get default template
  getDefault: async (userId: string): Promise<PublicScheduleTemplate | null> => {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("USER_ID_INVALID");
    }

    const doc = await scheduleTemplateRepository.getDefaultForUser(
      new Types.ObjectId(userId),
    );

    return doc ? toPublicTemplate(doc) : null;
  },

  // Update template
  update: async (
    userId: string,
    templateId: string,
    data: {
      name?: string;
      description?: string;
      pattern?: PublicScheduleTemplate["pattern"];
      tags?: string[];
      isDefault?: boolean;
    },
  ): Promise<PublicScheduleTemplate> => {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(templateId)) {
      throw new Error("ID_INVALID");
    }

    // If setting as default, unset current default first
    if (data.isDefault) {
      const existingDefault = await scheduleTemplateRepository.getDefaultForUser(
        new Types.ObjectId(userId),
      );
      if (existingDefault && String(existingDefault._id) !== templateId) {
        await scheduleTemplateRepository.updateByIdForUser(
          { templateId: existingDefault._id, userId: new Types.ObjectId(userId) },
          { isDefault: false },
        );
      }
    }

    const doc = await scheduleTemplateRepository.updateByIdForUser(
      { templateId, userId: new Types.ObjectId(userId) },
      data,
    );

    if (!doc) {
      throw new Error("TEMPLATE_NOT_FOUND");
    }

    return toPublicTemplate(doc);
  },

  // Delete template
  delete: async (
    userId: string,
    templateId: string,
  ): Promise<{ message: string }> => {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(templateId)) {
      throw new Error("ID_INVALID");
    }

    const deleted = await scheduleTemplateRepository.deleteByIdForUser({
      templateId,
      userId: new Types.ObjectId(userId),
    });

    if (!deleted) {
      throw new Error("TEMPLATE_NOT_FOUND");
    }

    return { message: "Xóa template thành công" };
  },

  // Apply template (increment usage count)
  apply: async (
    userId: string,
    templateId: string,
  ): Promise<{ template: PublicScheduleTemplate; message: string }> => {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(templateId)) {
      throw new Error("ID_INVALID");
    }

    const doc = await scheduleTemplateRepository.findByIdForUser({
      templateId,
      userId: new Types.ObjectId(userId),
    });

    if (!doc) {
      throw new Error("TEMPLATE_NOT_FOUND");
    }

    await scheduleTemplateRepository.incrementUsageCount(templateId);

    return {
      template: toPublicTemplate(doc),
      message: "Áp dụng template thành công",
    };
  },

  // Set as default
  setDefault: async (
    userId: string,
    templateId: string,
  ): Promise<{ message: string }> => {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(templateId)) {
      throw new Error("ID_INVALID");
    }

    const success = await scheduleTemplateRepository.setAsDefault({
      templateId,
      userId: new Types.ObjectId(userId),
    });

    if (!success) {
      throw new Error("TEMPLATE_NOT_FOUND");
    }

    return { message: "Đã đặt template mặc định" };
  },
};
