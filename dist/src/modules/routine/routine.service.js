"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routineService = void 0;
const mongoose_1 = require("mongoose");
const routine_model_1 = require("./routine.model");
exports.routineService = {
    async getRoutines(userId) {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("INVALID_USER_ID");
        }
        return routine_model_1.DailyRoutine.find({
            userId: new mongoose_1.Types.ObjectId(userId),
            isActive: true,
        }).sort({ startTime: 1 });
    },
    async createRoutine(userId, dto) {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("INVALID_USER_ID");
        }
        const routine = await routine_model_1.DailyRoutine.create({
            userId: new mongoose_1.Types.ObjectId(userId),
            title: dto.title.trim(),
            description: dto.description?.trim(),
            startTime: dto.startTime.trim(),
            endTime: dto.endTime.trim(),
            daysOfWeek: dto.daysOfWeek || [1, 2, 3, 4, 5, 6, 7],
            category: dto.category || "personal",
            color: dto.color || "#10b981",
            allowTaskOverlap: Boolean(dto.allowTaskOverlap),
            isActive: true,
        });
        return routine;
    },
    async updateRoutine(userId, id, dto) {
        if (!mongoose_1.Types.ObjectId.isValid(userId) || !mongoose_1.Types.ObjectId.isValid(id)) {
            throw new Error("INVALID_ID");
        }
        const routine = await routine_model_1.DailyRoutine.findOneAndUpdate({ _id: new mongoose_1.Types.ObjectId(id), userId: new mongoose_1.Types.ObjectId(userId) }, { $set: dto }, { new: true });
        return routine;
    },
    async deleteRoutine(userId, id) {
        if (!mongoose_1.Types.ObjectId.isValid(userId) || !mongoose_1.Types.ObjectId.isValid(id)) {
            throw new Error("INVALID_ID");
        }
        const res = await routine_model_1.DailyRoutine.findOneAndDelete({
            _id: new mongoose_1.Types.ObjectId(id),
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        return !!res;
    },
    async clearAllRoutines(userId) {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("INVALID_USER_ID");
        }
        await routine_model_1.DailyRoutine.deleteMany({
            userId: new mongoose_1.Types.ObjectId(userId),
        });
        return true;
    },
    /**
     * Khởi tạo bộ 7 thói quen sinh hoạt mẫu nếu người dùng chưa có
     */
    async seedDefaultRoutines(userId) {
        if (!mongoose_1.Types.ObjectId.isValid(userId)) {
            throw new Error("INVALID_USER_ID");
        }
        const userObjectId = new mongoose_1.Types.ObjectId(userId);
        const existing = await routine_model_1.DailyRoutine.countDocuments({ userId: userObjectId });
        if (existing > 0) {
            return routine_model_1.DailyRoutine.find({ userId: userObjectId, isActive: true }).sort({ startTime: 1 });
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
                description: "Khung giờ vàng rảnh rỗi tập trung cao độ mỗi tối (AI được xếp việc vào đây)",
                startTime: "21:00",
                endTime: "23:30",
                daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
                category: "study",
                color: "#8b5cf6",
                allowTaskOverlap: true,
                isActive: true,
            },
        ];
        await routine_model_1.DailyRoutine.insertMany(defaultRoutines);
        return routine_model_1.DailyRoutine.find({ userId: userObjectId, isActive: true }).sort({ startTime: 1 });
    },
};
