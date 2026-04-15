"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateNotificationSettings = exports.getNotificationSettings = exports.getById = exports.changePassword = exports.uploadAvatar = exports.updateProfile = exports.sendChangePasswordOtp = exports.me = void 0;
const user_service_1 = require("./user.service");
const cloudinary_service_1 = require("../../services/cloudinary.service");
const refresh_cookie_1 = require("../../common/cookies/refresh-cookie");
const me = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const user = await user_service_1.userService.me(userId);
        res.status(200).json(user);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_NOT_FOUND") {
            res.status(404).json({ message: "Không tìm thấy người dùng" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.me = me;
const sendChangePasswordOtp = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const result = await user_service_1.userService.sendChangePasswordOtp(userId);
        res.status(200).json(result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_NOT_FOUND") {
            res.status(404).json({ message: "Không tìm thấy người dùng" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.sendChangePasswordOtp = sendChangePasswordOtp;
const updateProfile = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const dobRaw = _req.body?.dob !== undefined ? String(_req.body.dob) : undefined;
        const dob = dobRaw ? new Date(dobRaw) : undefined;
        if (dobRaw && Number.isNaN(dob?.getTime())) {
            res.status(400).json({ message: "Ngày sinh không hợp lệ" });
            return;
        }
        const user = await user_service_1.userService.updateProfile(userId, {
            name: _req.body?.name !== undefined ? String(_req.body.name) : undefined,
            bio: _req.body?.bio !== undefined ? String(_req.body.bio) : undefined,
            phone: _req.body?.phone !== undefined ? String(_req.body.phone) : undefined,
            dob,
            address: _req.body?.address !== undefined
                ? String(_req.body.address)
                : undefined,
            settings: _req.body?.settings !== undefined
                ? _req.body.settings
                : undefined,
        });
        res.status(200).json({ user });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "INVALID_NAME") {
            res.status(400).json({ message: "Tên không hợp lệ" });
            return;
        }
        if (message === "USER_NOT_FOUND") {
            res.status(404).json({ message: "Không tìm thấy người dùng" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.updateProfile = updateProfile;
const uploadAvatar = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const file = _req.file;
        if (!file?.buffer) {
            res.status(400).json({ message: "Thiếu file avatar" });
            return;
        }
        if (file.mimetype && !file.mimetype.startsWith("image/")) {
            res.status(400).json({ message: "File không phải hình ảnh" });
            return;
        }
        const uploaded = await (0, cloudinary_service_1.uploadImageBuffer)(file.buffer, {
            folder: "task-management-ai/avatars",
            publicId: `user_${userId}_${Date.now()}`,
        });
        const user = await user_service_1.userService.uploadAvatar(userId, uploaded.url);
        res.status(200).json({ user });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "Missing env CLOUDINARY") {
            res.status(500).json({ message: "Thiếu cấu hình Cloudinary" });
            return;
        }
        if (message === "USER_NOT_FOUND") {
            res.status(404).json({ message: "Không tìm thấy người dùng" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.uploadAvatar = uploadAvatar;
const changePassword = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const result = await user_service_1.userService.verifyChangePasswordOtp(userId, {
            otp: String(_req.body?.otp ?? "").trim(),
            newPassword: String(_req.body?.newPassword ?? ""),
        });
        (0, refresh_cookie_1.clearRefreshCookie)(res);
        res.status(200).json(result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "INVALID_INPUT") {
            res.status(400).json({ message: "Thiếu OTP hoặc mật khẩu mới" });
            return;
        }
        if (message === "INVALID_OTP") {
            res.status(400).json({ message: "OTP không hợp lệ" });
            return;
        }
        if (message === "INVALID_PASSWORD") {
            res.status(400).json({ message: "Mật khẩu mới phải ít nhất 6 ký tự" });
            return;
        }
        if (message === "OTP_INVALID_OR_EXPIRED") {
            res.status(401).json({ message: "OTP không đúng hoặc đã hết hạn" });
            return;
        }
        if (message === "USER_NOT_FOUND") {
            res.status(404).json({ message: "Không tìm thấy người dùng" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.changePassword = changePassword;
const getById = async (_req, res) => {
    res.status(501).json({ message: "Not implemented" });
};
exports.getById = getById;
const getNotificationSettings = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const settings = await user_service_1.userService.getNotificationSettings(userId);
        res.status(200).json({ settings });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_NOT_FOUND") {
            res.status(404).json({ message: "Không tìm thấy người dùng" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.getNotificationSettings = getNotificationSettings;
const updateNotificationSettings = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const settings = await user_service_1.userService.updateNotificationSettings(userId, {
            reminderMinutes: _req.body?.reminderMinutes,
        });
        res.status(200).json({ settings });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "INVALID_REMINDER_MINUTES") {
            res.status(400).json({ message: "Số phút nhắc trước không hợp lệ" });
            return;
        }
        if (message === "USER_NOT_FOUND") {
            res.status(404).json({ message: "Không tìm thấy người dùng" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.updateNotificationSettings = updateNotificationSettings;
