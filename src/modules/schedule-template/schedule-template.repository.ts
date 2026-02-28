import { Types } from "mongoose";
import {
  ScheduleTemplate,
  ScheduleTemplateAttrs,
  ScheduleTemplateDoc,
} from "./schedule-template.model";

export const scheduleTemplateRepository = {
  // Create new template
  create: async (
    attrs: ScheduleTemplateAttrs,
  ): Promise<ScheduleTemplateDoc> => {
    return ScheduleTemplate.create({
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
  findById: async (
    templateId: string | Types.ObjectId,
  ): Promise<ScheduleTemplateDoc | null> => {
    return ScheduleTemplate.findById(templateId).exec();
  },

  // Find by ID for user (ownership check)
  findByIdForUser: async (params: {
    templateId: string | Types.ObjectId;
    userId: string | Types.ObjectId;
  }): Promise<ScheduleTemplateDoc | null> => {
    return ScheduleTemplate.findOne({
      _id: params.templateId,
      userId: params.userId,
    }).exec();
  },

  // List templates for user
  listByUser: async (params: {
    userId: string | Types.ObjectId;
    tag?: string;
    limit?: number;
  }): Promise<ScheduleTemplateDoc[]> => {
    const filter: Record<string, unknown> = {
      userId: params.userId,
    };

    if (params.tag) {
      filter.tags = params.tag;
    }

    return ScheduleTemplate.find(filter)
      .sort({ isDefault: -1, usageCount: -1, createdAt: -1 })
      .limit(params.limit ?? 20)
      .exec();
  },

  // Get default template for user
  getDefaultForUser: async (
    userId: string | Types.ObjectId,
  ): Promise<ScheduleTemplateDoc | null> => {
    return ScheduleTemplate.findOne({
      userId,
      isDefault: true,
    }).exec();
  },

  // Update template
  updateByIdForUser: async (
    params: {
      templateId: string | Types.ObjectId;
      userId: string | Types.ObjectId;
    },
    update: {
      name?: string;
      description?: string;
      pattern?: ScheduleTemplateAttrs["pattern"];
      isDefault?: boolean;
      tags?: string[];
    },
  ): Promise<ScheduleTemplateDoc | null> => {
    return ScheduleTemplate.findOneAndUpdate(
      { _id: params.templateId, userId: params.userId },
      {
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
      },
      { new: true },
    ).exec();
  },

  // Delete template
  deleteByIdForUser: async (params: {
    templateId: string | Types.ObjectId;
    userId: string | Types.ObjectId;
  }): Promise<ScheduleTemplateDoc | null> => {
    return ScheduleTemplate.findOneAndDelete({
      _id: params.templateId,
      userId: params.userId,
    }).exec();
  },

  // Increment usage count
  incrementUsageCount: async (
    templateId: string | Types.ObjectId,
  ): Promise<void> => {
    await ScheduleTemplate.findByIdAndUpdate(templateId, {
      $inc: { usageCount: 1 },
    }).exec();
  },

  // Set as default (and unset other defaults for same user)
  setAsDefault: async (params: {
    templateId: string | Types.ObjectId;
    userId: string | Types.ObjectId;
  }): Promise<boolean> => {
    // Unset current default
    await ScheduleTemplate.updateMany(
      { userId: params.userId, isDefault: true },
      { $set: { isDefault: false } },
    );

    // Set new default
    const result = await ScheduleTemplate.findOneAndUpdate(
      { _id: params.templateId, userId: params.userId },
      { $set: { isDefault: true } },
    );

    return !!result;
  },
};
