import mongoose, { Schema, Types } from "mongoose";

// Template cho cấu trúc lịch làm việc có thể tái sử dụng
export type ScheduleTemplateAttrs = {
  userId: Types.ObjectId;
  name: string; // Tên template: "Lịch làm việc cuối tuần", "Lịch học tập buổi sáng"
  description?: string;
  pattern: {
    // Cấu trúc lịch chuẩn
    days: {
      dayOfWeek: number; // 0 = Chủ nhật, 1 = Thứ 2, ..., 6 = Thứ 7
      timeBlocks: {
        startTime: string; // "09:00"
        endTime: string; // "11:00"
        label: string; // "Làm việc tập trung", "Học tập"
        breakDuration?: number; // Phút nghỉ sau block này
      }[];
    }[];
    // Cấu hình cho AI khi áp dụng template
    aiConfig?: {
      preferredWorkPattern?: "morning" | "afternoon" | "evening" | "mixed";
      maxTasksPerDay?: number;
      minBreakBetweenTasks?: number; // Phút
    };
  };
  isDefault?: boolean; // Template mặc định cho user này
  tags?: string[]; // "weekend", "workday", "study", "deep-work"
  usageCount?: number; // Số lần đã sử dụng
};

export type ScheduleTemplateDoc = mongoose.Document & {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
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

export type ScheduleTemplateModel = mongoose.Model<ScheduleTemplateDoc>;

const scheduleTemplateSchema = new Schema<ScheduleTemplateDoc>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: "User",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    pattern: {
      days: [
        {
          dayOfWeek: {
            type: Number,
            required: true,
            min: 0,
            max: 6,
          },
          timeBlocks: [
            {
              startTime: { type: String, required: true }, // "HH:MM"
              endTime: { type: String, required: true }, // "HH:MM"
              label: { type: String, required: true },
              breakDuration: { type: Number, default: 15 }, // Phút
            },
          ],
        },
      ],
      aiConfig: {
        preferredWorkPattern: {
          type: String,
          enum: ["morning", "afternoon", "evening", "mixed"],
        },
        maxTasksPerDay: { type: Number, default: 5 },
        minBreakBetweenTasks: { type: Number, default: 15 },
      },
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    tags: {
      type: [String],
      default: [],
    },
    usageCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
scheduleTemplateSchema.index({ userId: 1, isDefault: 1 });
scheduleTemplateSchema.index({ userId: 1, tags: 1 });
scheduleTemplateSchema.index({ userId: 1, usageCount: -1 });

export const ScheduleTemplate =
  (mongoose.models
    .ScheduleTemplate as ScheduleTemplateModel) ||
  mongoose.model<ScheduleTemplateDoc>(
    "ScheduleTemplate",
    scheduleTemplateSchema,
  );
