"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearAllRoutines = exports.seedDefaultRoutines = exports.deleteRoutine = exports.updateRoutine = exports.createRoutine = exports.getRoutines = void 0;
const routine_service_1 = require("./routine.service");
const getUserId = (req) => {
    const user = req.user;
    const id = user?.userId || user?._id || user?.id;
    return id ? String(id) : null;
};
const getRoutines = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Chưa xác thực người dùng" });
        }
        const routines = await routine_service_1.routineService.getRoutines(userId);
        return res.status(200).json({ routines });
    }
    catch (err) {
        return res.status(500).json({ message: err.message || "Lỗi khi lấy danh sách lịch lặp lại" });
    }
};
exports.getRoutines = getRoutines;
const createRoutine = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Chưa xác thực người dùng" });
        }
        const { title, description, startTime, endTime, daysOfWeek, category, color } = req.body;
        if (!title || !startTime || !endTime) {
            return res.status(400).json({ message: "Tiêu đề, giờ bắt đầu và giờ kết thúc là bắt buộc" });
        }
        const routine = await routine_service_1.routineService.createRoutine(userId, {
            title,
            description,
            startTime,
            endTime,
            daysOfWeek,
            category,
            color,
        });
        return res.status(201).json({ routine, message: "Đã tạo lịch lặp lại hàng ngày thành công" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message || "Lỗi khi tạo lịch lặp lại" });
    }
};
exports.createRoutine = createRoutine;
const updateRoutine = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Chưa xác thực người dùng" });
        }
        const id = String(req.params.id);
        const routine = await routine_service_1.routineService.updateRoutine(userId, id, req.body);
        if (!routine) {
            return res.status(404).json({ message: "Không tìm thấy lịch lặp lại" });
        }
        return res.status(200).json({ routine, message: "Đã cập nhật lịch lặp lại thành công" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message || "Lỗi khi cập nhật lịch lặp lại" });
    }
};
exports.updateRoutine = updateRoutine;
const deleteRoutine = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Chưa xác thực người dùng" });
        }
        const id = String(req.params.id);
        const success = await routine_service_1.routineService.deleteRoutine(userId, id);
        if (!success) {
            return res.status(404).json({ message: "Không tìm thấy lịch lặp lại để xóa" });
        }
        return res.status(200).json({ success: true, message: "Đã xóa lịch lặp lại thành công" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message || "Lỗi khi xóa lịch lặp lại" });
    }
};
exports.deleteRoutine = deleteRoutine;
const seedDefaultRoutines = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Chưa xác thực người dùng" });
        }
        const routines = await routine_service_1.routineService.seedDefaultRoutines(userId);
        return res.status(200).json({ routines, message: "Đã nạp bộ lịch lặp lại hàng ngày mẫu thành công" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message || "Lỗi khi nạp lịch lặp lại mẫu" });
    }
};
exports.seedDefaultRoutines = seedDefaultRoutines;
const clearAllRoutines = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            return res.status(401).json({ message: "Chưa xác thực người dùng" });
        }
        await routine_service_1.routineService.clearAllRoutines(userId);
        return res.status(200).json({ success: true, message: "Đã xóa toàn bộ lịch lặp lại thành công" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message || "Lỗi khi xóa tất cả lịch lặp lại" });
    }
};
exports.clearAllRoutines = clearAllRoutines;
