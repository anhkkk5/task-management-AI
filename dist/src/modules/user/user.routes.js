"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("./user.controller");
const user_habit_controller_1 = require("./user-habit.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const upload_middleware_1 = require("../../middleware/upload.middleware");
const userRouter = (0, express_1.Router)();
userRouter.get("/me", auth_middleware_1.authMiddleware, user_controller_1.me);
userRouter.get("/notification-settings", auth_middleware_1.authMiddleware, user_controller_1.getNotificationSettings);
userRouter.patch("/notification-settings", auth_middleware_1.authMiddleware, user_controller_1.updateNotificationSettings);
userRouter.patch("/update-profile", auth_middleware_1.authMiddleware, user_controller_1.updateProfile);
userRouter.patch("/upload-avatar", auth_middleware_1.authMiddleware, upload_middleware_1.upload.single("avatar"), user_controller_1.uploadAvatar);
userRouter.patch("/change-password", auth_middleware_1.authMiddleware, user_controller_1.changePassword);
userRouter.post("/change-password/send-otp", auth_middleware_1.authMiddleware, user_controller_1.sendChangePasswordOtp);
// User habits routes
userRouter.get("/habits", auth_middleware_1.authMiddleware, user_habit_controller_1.getUserHabits);
userRouter.patch("/habits", auth_middleware_1.authMiddleware, user_habit_controller_1.updateUserHabits);
userRouter.post("/habits/track", auth_middleware_1.authMiddleware, user_habit_controller_1.trackTaskCompletion);
userRouter.get("/:id", auth_middleware_1.authMiddleware, user_controller_1.getById);
// Search user by email (for invite lookup)
userRouter.get("/search/by-email", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const { email } = req.query;
        if (!email)
            return res.status(400).json({ message: "Email required" });
        const { User } = await Promise.resolve().then(() => __importStar(require("../auth/auth.model")));
        const user = await User.findOne({
            email: email.toLowerCase().trim(),
        }).select("_id name email avatar");
        if (!user)
            return res
                .status(404)
                .json({ message: "Không tìm thấy người dùng với email này" });
        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            avatar: user.avatar,
        });
    }
    catch {
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
});
exports.default = userRouter;
