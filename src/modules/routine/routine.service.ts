import { Types } from "mongoose";
import { DailyRoutine, IDailyRoutine } from "./routine.model";

export interface CreateRoutineDto {
  title: string;
  description?: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  daysOfWeek?: number[];
  category?: string;
  color?: string;
}

export interface UpdateRoutineDto {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
  category?: string;
  color?: string;
  isActive?: boolean;
}

export const routineService = {
  async getRoutines(userId: string): Promise<IDailyRoutine[]> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("INVALID_USER_ID");
    }
    return DailyRoutine.find({
      userId: new Types.ObjectId(userId),
      isActive: true,
    }).sort({ startTime: 1 });
  },

  async createRoutine(
    userId: string,
    dto: CreateRoutineDto
  ): Promise<IDailyRoutine> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("INVALID_USER_ID");
    }
    const routine = await DailyRoutine.create({
      userId: new Types.ObjectId(userId),
      title: dto.title.trim(),
      description: dto.description?.trim(),
      startTime: dto.startTime.trim(),
      endTime: dto.endTime.trim(),
      daysOfWeek: dto.daysOfWeek || [1, 2, 3, 4, 5, 6, 7],
      category: dto.category || "personal",
      color: dto.color || "#10b981",
      isActive: true,
    });
    return routine;
  },

  async updateRoutine(
    userId: string,
    id: string,
    dto: UpdateRoutineDto
  ): Promise<IDailyRoutine | null> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(id)) {
      throw new Error("INVALID_ID");
    }
    const routine = await DailyRoutine.findOneAndUpdate(
      { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
      { $set: dto },
      { new: true }
    );
    return routine;
  },

  async deleteRoutine(userId: string, id: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(id)) {
      throw new Error("INVALID_ID");
    }
    const res = await DailyRoutine.findOneAndDelete({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });
    return !!res;
  },

  /**
   * Khởi tạo bộ 7 thói quen sinh hoạt mẫu nếu người dùng chưa có
   */
  async seedDefaultRoutines(userId: string): Promise<IDailyRoutine[]> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new Error("INVALID_USER_ID");
    }
    const userObjectId = new Types.ObjectId(userId);
    const existing = await DailyRoutine.countDocuments({ userId: userObjectId });
    if (existing > 0) {
      return DailyRoutine.find({ userId: userObjectId, isActive: true }).sort({ startTime: 1 });
    }

    const defaultRoutines = [
      {
        userId: userObjectId,
        title: "Dậy đánh răng rửa mặt & Vệ sinh cá nhân",
        description: "Bắt đầu ngày mới tỉnh táo và sảng khoái",
        startTime: "06:30",
        endTime: "07:00",
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        category: "health",
        color: "#10b981",
        isActive: true,
      },
      {
        userId: userObjectId,
        title: "Tập thể dục sáng",
        description: "Khởi động ngày mới với bài tập nhẹ nhàng",
        startTime: "07:00",
        endTime: "07:15",
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        category: "health",
        color: "#22c55e",
        isActive: true,
      },
      {
        userId: userObjectId,
        title: "Ăn sáng & Dọn dẹp",
        description: "Bữa sáng nạp năng lượng và sắp xếp gọn gàng",
        startTime: "07:15",
        endTime: "08:15",
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        category: "lifestyle",
        color: "#eab308",
        isActive: true,
      },
      {
        userId: userObjectId,
        title: "Đi làm công ty",
        description: "Thời gian làm việc cố định tại cơ quan/công trường",
        startTime: "08:30",
        endTime: "18:00",
        daysOfWeek: [1, 2, 3, 4, 5], // Thứ 2 đến Thứ 6
        category: "work",
        color: "#ef4444",
        isActive: true,
      },
      {
        userId: userObjectId,
        title: "Tắm giặt & Nghỉ ngơi",
        description: "Khoảng nghỉ thư giãn buổi tối sau ngày dài",
        startTime: "19:00",
        endTime: "19:45",
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        category: "personal",
        color: "#06b6d4",
        isActive: true,
      },
      {
        userId: userObjectId,
        title: "Nấu nướng & Ăn tối",
        description: "Bữa tối ấm cúng và hồi phục năng lượng",
        startTime: "20:00",
        endTime: "21:00",
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        category: "lifestyle",
        color: "#f97316",
        isActive: true,
      },
      {
        userId: userObjectId,
        title: "Làm việc tại nhà & Tự học",
        description: "Khung giờ vàng rảnh rỗi tập trung cao độ mỗi tối",
        startTime: "21:00",
        endTime: "23:30",
        daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
        category: "study",
        color: "#8b5cf6",
        isActive: true,
      },
    ];

    await DailyRoutine.insertMany(defaultRoutines);
    return DailyRoutine.find({ userId: userObjectId, isActive: true }).sort({ startTime: 1 });
  },
};
