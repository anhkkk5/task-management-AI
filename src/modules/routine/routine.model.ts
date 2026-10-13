import mongoose, { Schema, Document, Types } from "mongoose";

export interface IDailyRoutine extends Document {
  userId: Types.ObjectId;
  title: string;
  description?: string;
  startTime: string; // HH:mm, ví dụ "06:30"
  endTime: string;   // HH:mm, ví dụ "07:00"
  daysOfWeek: number[]; // 1=Thứ 2, 2=Thứ 3, ..., 6=Thứ 7, 7=Chủ Nhật
  category: string;  // "personal" | "health" | "work" | "study" | "lifestyle"
  color: string;     // Mã màu hiển thị trên lịch
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DailyRoutineSchema = new Schema<IDailyRoutine>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    daysOfWeek: {
      type: [Number],
      required: true,
      default: [1, 2, 3, 4, 5, 6, 7],
    },
    category: { type: String, default: "personal" },
    color: { type: String, default: "#10b981" },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

DailyRoutineSchema.index({ userId: 1, isActive: 1 });

export const DailyRoutine = mongoose.model<IDailyRoutine>(
  "DailyRoutine",
  DailyRoutineSchema
);
