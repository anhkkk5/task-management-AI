"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCustomDate = exports.setCustomDate = exports.updateWeeklyPattern = exports.getMyAvailability = void 0;
const free_time_service_1 = require("./free-time.service");
const getUserId = (req) => {
    const userId = req.user?.userId;
    return userId ? String(userId) : null;
};
const getMyAvailability = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const data = await free_time_service_1.freeTimeService.getMyAvailability(userId);
        res.status(200).json({ availability: data });
    }
    catch (err) {
        res.status(500).json({ message: err?.message || "Lỗi hệ thống" });
    }
};
exports.getMyAvailability = getMyAvailability;
const updateWeeklyPattern = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const weeklyPattern = req.body?.weeklyPattern;
        const timezone = req.body?.timezone
            ? String(req.body.timezone)
            : undefined;
        const data = await free_time_service_1.freeTimeService.updateWeeklyPattern(userId, weeklyPattern, timezone);
        res.status(200).json({ availability: data, message: "Đã cập nhật lịch rảnh" });
    }
    catch (err) {
        const message = String(err?.message || "");
        if (message === "INVALID_ID") {
            res.status(400).json({ message: "User ID không hợp lệ" });
            return;
        }
        if (message === "INVALID_TIMEZONE" ||
            message === "INVALID_TIME_FORMAT" ||
            message === "INVALID_TIME_RANGE" ||
            message === "SLOTS_OVERLAP") {
            res.status(400).json({ message: "Dữ liệu lịch rảnh không hợp lệ" });
            return;
        }
        res.status(500).json({ message: err?.message || "Lỗi hệ thống" });
    }
};
exports.updateWeeklyPattern = updateWeeklyPattern;
const setCustomDate = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const date = String(req.params?.date || "").trim();
        const slots = req.body?.slots;
        const data = await free_time_service_1.freeTimeService.setCustomDate(userId, date, slots);
        res.status(200).json({ availability: data, message: "Đã lưu lịch rảnh theo ngày" });
    }
    catch (err) {
        const message = String(err?.message || "");
        if (message === "INVALID_ID" ||
            message === "INVALID_DATE" ||
            message === "INVALID_TIME_FORMAT" ||
            message === "INVALID_TIME_RANGE" ||
            message === "SLOTS_OVERLAP") {
            res.status(400).json({ message: "Dữ liệu không hợp lệ" });
            return;
        }
        res.status(500).json({ message: err?.message || "Lỗi hệ thống" });
    }
};
exports.setCustomDate = setCustomDate;
const deleteCustomDate = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const date = String(req.params?.date || "").trim();
        const data = await free_time_service_1.freeTimeService.deleteCustomDate(userId, date);
        res.status(200).json({ availability: data, message: "Đã xóa lịch ngày tùy chỉnh" });
    }
    catch (err) {
        const message = String(err?.message || "");
        if (message === "INVALID_ID") {
            res.status(400).json({ message: "ID không hợp lệ" });
            return;
        }
        if (message === "NOT_FOUND") {
            res.status(404).json({ message: "Không tìm thấy dữ liệu" });
            return;
        }
        res.status(500).json({ message: err?.message || "Lỗi hệ thống" });
    }
};
exports.deleteCustomDate = deleteCustomDate;
