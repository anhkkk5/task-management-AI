"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.verifyForgotPasswordOtp = exports.forgotPassword = exports.uploadAvatar = exports.updateProfile = exports.me = exports.refreshToken = exports.login = exports.verifyOtp = exports.resendOtp = exports.sendOtp = exports.logoutAll = exports.logout = exports.register = void 0;
const auth_service_1 = require("./auth.service");
const auth_repository_1 = require("./auth.repository");
const auth_error_handler_1 = require("../../common/errors/auth.error-handler");
const refresh_cookie_1 = require("../../common/cookies/refresh-cookie");
const extract_refresh_token_1 = require("../../common/utils/extract-refresh-token");
const cookieInput = () => {
    return {
        maxAgeMs: auth_service_1.authService.getRefreshCookieMaxAgeMs(),
        nodeEnv: process.env.NODE_ENV,
    };
};
const registerErrorMap = {
    EMAIL_EXISTS: { status: 409, message: "Email đã tồn tại" },
    INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
    INVALID_PASSWORD: { status: 400, message: "Mật khẩu phải ít nhất 6 ký tự" },
    INVALID_INPUT: { status: 400, message: "Thiếu thông tin đăng ký" },
    "Missing env EMAIL_FROM": {
        status: 500,
        message: "Thiếu cấu hình EMAIL_FROM",
    },
};
const sendOtpErrorMap = {
    INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
    INVALID_INPUT: { status: 400, message: "Thiếu email" },
    PENDING_NOT_FOUND: {
        status: 404,
        message: "Không có đăng ký đang chờ xác thực",
    },
    "Missing env EMAIL_FROM": {
        status: 500,
        message: "Thiếu cấu hình EMAIL_FROM",
    },
};
const verifyOtpErrorMap = {
    INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
    INVALID_OTP: { status: 400, message: "OTP không hợp lệ" },
    INVALID_INPUT: { status: 400, message: "Thiếu email hoặc otp" },
    PENDING_NOT_FOUND: {
        status: 404,
        message: "Không có đăng ký đang chờ xác thực",
    },
    OTP_INVALID_OR_EXPIRED: { status: 400, message: "OTP sai hoặc đã hết hạn" },
    EMAIL_EXISTS: { status: 409, message: "Email đã tồn tại" },
};
const loginErrorMap = {
    INVALID_CREDENTIALS: { status: 401, message: "Sai email hoặc mật khẩu" },
    TOO_MANY_ATTEMPTS: {
        status: 429,
        message: "Bạn đã thử quá nhiều lần, vui lòng thử lại sau",
    },
    EMAIL_NOT_VERIFIED: { status: 403, message: "Email chưa được xác thực OTP" },
    INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
    INVALID_INPUT: { status: 400, message: "Thiếu thông tin đăng nhập" },
    "Missing env JWT_ACCESS_SECRET": {
        status: 500,
        message: "Thiếu cấu hình JWT_ACCESS_SECRET",
    },
    "Missing env JWT_REFRESH_SECRET": {
        status: 500,
        message: "Thiếu cấu hình JWT_REFRESH_SECRET",
    },
};
const refreshTokenErrorMap = {
    INVALID_INPUT: { status: 400, message: "Thiếu refresh token" },
    REFRESH_TOKEN_INVALID: { status: 401, message: "Refresh token không hợp lệ" },
    REFRESH_TOKEN_REVOKED: {
        status: 401,
        message: "Refresh token đã bị thu hồi",
    },
    USER_NOT_FOUND: { status: 404, message: "Không tìm thấy người dùng" },
    "Missing env JWT_ACCESS_SECRET": {
        status: 500,
        message: "Thiếu cấu hình JWT_ACCESS_SECRET",
    },
    "Missing env JWT_REFRESH_SECRET": {
        status: 500,
        message: "Thiếu cấu hình JWT_REFRESH_SECRET",
    },
};
const logoutErrorMap = {
    INVALID_INPUT: { status: 400, message: "Thiếu refresh token" },
    REFRESH_TOKEN_INVALID: { status: 401, message: "Refresh token không hợp lệ" },
};
const updateProfileErrorMap = {
    INVALID_NAME: { status: 400, message: "Tên không hợp lệ" },
    USER_NOT_FOUND: { status: 404, message: "Không tìm thấy người dùng" },
};
const register = async (_req, res) => {
    try {
        const result = await auth_service_1.authService.register({
            email: String(_req.body?.email ?? ""),
            password: String(_req.body?.password ?? ""),
            name: String(_req.body?.name ?? ""),
        });
        res.status(201).json(result);
    }
    catch (err) {
        (0, auth_error_handler_1.handleAuthError)(err, res, registerErrorMap);
    }
};
exports.register = register;
const logout = async (_req, res) => {
    try {
        const token = (0, extract_refresh_token_1.extractRefreshToken)(_req);
        await auth_service_1.authService.logout({ refreshToken: token });
        (0, refresh_cookie_1.clearRefreshCookie)(res);
        res.status(200).json({ message: "Đăng xuất thành công" });
    }
    catch (err) {
        (0, auth_error_handler_1.handleAuthError)(err, res, logoutErrorMap);
    }
};
exports.logout = logout;
const logoutAll = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        await auth_service_1.authService.logoutAll(userId);
        res.clearCookie("refreshToken", {
            path: "/auth",
        });
        res.status(200).json({ message: "Đăng xuất tất cả thiết bị thành công" });
    }
    catch (_err) {
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.logoutAll = logoutAll;
const sendOtp = async (_req, res) => {
    try {
        const result = await auth_service_1.authService.sendOtp({
            email: String(_req.body?.email ?? ""),
        });
        res.status(200).json(result);
    }
    catch (err) {
        (0, auth_error_handler_1.handleAuthError)(err, res, sendOtpErrorMap);
    }
};
exports.sendOtp = sendOtp;
const resendOtp = async (_req, res) => {
    return (0, exports.sendOtp)(_req, res);
};
exports.resendOtp = resendOtp;
const verifyOtp = async (_req, res) => {
    try {
        const result = await auth_service_1.authService.verifyOtp({
            email: String(_req.body?.email ?? ""),
            otp: String(_req.body?.otp ?? ""),
        });
        res.status(200).json(result);
    }
    catch (err) {
        (0, auth_error_handler_1.handleAuthError)(err, res, verifyOtpErrorMap);
    }
};
exports.verifyOtp = verifyOtp;
const login = async (_req, res) => {
    try {
        const result = await auth_service_1.authService.login({
            email: String(_req.body?.email ?? ""),
            password: String(_req.body?.password ?? ""),
            ip: String((Array.isArray(_req.headers["x-forwarded-for"])
                ? _req.headers["x-forwarded-for"][0]
                : _req.headers["x-forwarded-for"]) ??
                _req.ip ??
                ""),
        });
        (0, refresh_cookie_1.setRefreshCookie)(res, result.refreshToken, cookieInput());
        res
            .status(200)
            .json({ accessToken: result.accessToken, user: result.user });
    }
    catch (err) {
        (0, auth_error_handler_1.handleAuthError)(err, res, loginErrorMap);
    }
};
exports.login = login;
const refreshToken = async (_req, res) => {
    try {
        const token = (0, extract_refresh_token_1.extractRefreshToken)(_req);
        const result = await auth_service_1.authService.refreshToken({ refreshToken: token });
        (0, refresh_cookie_1.setRefreshCookie)(res, result.refreshToken, cookieInput());
        res.status(200).json({ accessToken: result.accessToken });
    }
    catch (err) {
        (0, auth_error_handler_1.handleAuthError)(err, res, refreshTokenErrorMap);
    }
};
exports.refreshToken = refreshToken;
const me = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const user = await auth_repository_1.authRepository.findById(userId);
        if (!user) {
            res.status(404).json({ message: "Không tìm thấy người dùng" });
            return;
        }
        res.status(200).json({
            id: String(user._id),
            email: user.email,
            name: user.name,
            role: user.role,
            avatar: user.avatar,
            isVerified: user.isVerified,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });
    }
    catch (_err) {
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.me = me;
const updateProfile = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const user = await auth_service_1.authService.updateProfile(userId, {
            name: _req.body?.name !== undefined ? String(_req.body.name) : undefined,
            avatar: _req.body?.avatar !== undefined ? String(_req.body.avatar) : undefined,
        });
        res.status(200).json({ user });
    }
    catch (err) {
        (0, auth_error_handler_1.handleAuthError)(err, res, updateProfileErrorMap);
    }
};
exports.updateProfile = updateProfile;
const uploadAvatarErrorMap = {
    INVALID_INPUT: { status: 400, message: "Thiếu file ảnh" },
    FILE_TOO_LARGE: { status: 400, message: "Ảnh phải nhỏ hơn 5MB" },
    INVALID_FILE_TYPE: { status: 400, message: "Chỉ chấp nhận file ảnh" },
    UPLOAD_FAILED: { status: 500, message: "Tải ảnh lên thất bại" },
};
const uploadAvatar = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        if (!_req.file) {
            res.status(400).json({ message: "Thiếu file ảnh" });
            return;
        }
        const url = await auth_service_1.authService.uploadAvatar(userId, _req.file);
        res.status(200).json({ url });
    }
    catch (err) {
        (0, auth_error_handler_1.handleAuthError)(err, res, uploadAvatarErrorMap);
    }
};
exports.uploadAvatar = uploadAvatar;
const forgotPasswordErrorMap = {
    INVALID_INPUT: { status: 400, message: "Thiếu email" },
    INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
    USER_NOT_FOUND: { status: 404, message: "Không tìm thấy người dùng" },
};
const verifyForgotPasswordOtpErrorMap = {
    INVALID_INPUT: { status: 400, message: "Thiếu email hoặc OTP" },
    INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
    INVALID_OTP: { status: 400, message: "OTP phải có 6 chữ số" },
    USER_NOT_FOUND: { status: 404, message: "Không tìm thấy người dùng" },
    OTP_INVALID_OR_EXPIRED: { status: 400, message: "OTP sai hoặc đã hết hạn" },
};
const resetPasswordErrorMap = {
    INVALID_INPUT: { status: 400, message: "Thiếu thông tin" },
    INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
    INVALID_OTP: { status: 400, message: "OTP phải có 6 chữ số" },
    INVALID_PASSWORD: { status: 400, message: "Mật khẩu phải ít nhất 6 ký tự" },
    USER_NOT_FOUND: { status: 404, message: "Không tìm thấy người dùng" },
    OTP_INVALID_OR_EXPIRED: { status: 400, message: "OTP sai hoặc đã hết hạn" },
};
const forgotPassword = async (_req, res) => {
    try {
        const result = await auth_service_1.authService.forgotPassword(String(_req.body?.email ?? ""));
        res.status(200).json(result);
    }
    catch (err) {
        (0, auth_error_handler_1.handleAuthError)(err, res, forgotPasswordErrorMap);
    }
};
exports.forgotPassword = forgotPassword;
const verifyForgotPasswordOtp = async (_req, res) => {
    try {
        const result = await auth_service_1.authService.verifyForgotPasswordOtp(String(_req.body?.email ?? ""), String(_req.body?.otp ?? ""));
        res.status(200).json(result);
    }
    catch (err) {
        (0, auth_error_handler_1.handleAuthError)(err, res, verifyForgotPasswordOtpErrorMap);
    }
};
exports.verifyForgotPasswordOtp = verifyForgotPasswordOtp;
const resetPassword = async (_req, res) => {
    try {
        const result = await auth_service_1.authService.resetPassword(String(_req.body?.email ?? ""), String(_req.body?.otp ?? ""), String(_req.body?.newPassword ?? ""));
        res.status(200).json(result);
    }
    catch (err) {
        (0, auth_error_handler_1.handleAuthError)(err, res, resetPasswordErrorMap);
    }
};
exports.resetPassword = resetPassword;
