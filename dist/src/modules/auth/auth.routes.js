"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_controller_1 = require("./auth.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const authRouter = (0, express_1.Router)();
// Multer storage config - store in memory for cloudinary upload
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});
authRouter.post("/register", auth_controller_1.register);
authRouter.post("/send-otp", auth_controller_1.sendOtp);
authRouter.post("/resend-otp", auth_controller_1.resendOtp);
authRouter.post("/verify-otp", auth_controller_1.verifyOtp);
authRouter.post("/login", auth_controller_1.login);
authRouter.post("/refresh-token", auth_controller_1.refreshToken);
authRouter.post("/logout", auth_controller_1.logout);
authRouter.post("/logout-all", auth_middleware_1.authMiddleware, auth_controller_1.logoutAll);
authRouter.get("/me", auth_middleware_1.authMiddleware, auth_controller_1.me);
authRouter.patch("/update-profile", auth_middleware_1.authMiddleware, auth_controller_1.updateProfile);
authRouter.post("/upload-avatar", auth_middleware_1.authMiddleware, upload.single("avatar"), auth_controller_1.uploadAvatar);
// Forgot password routes
authRouter.post("/forgot-password", auth_controller_1.forgotPassword);
authRouter.post("/verify-forgot-password-otp", auth_controller_1.verifyForgotPasswordOtp);
authRouter.post("/reset-password", auth_controller_1.resetPassword);
exports.default = authRouter;
