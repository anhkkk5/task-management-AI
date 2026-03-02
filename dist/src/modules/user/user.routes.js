"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("./user.controller");
const user_habit_controller_1 = require("./user-habit.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const upload_middleware_1 = require("../../middleware/upload.middleware");
const userRouter = (0, express_1.Router)();
userRouter.get("/me", auth_middleware_1.authMiddleware, user_controller_1.me);
userRouter.patch("/update-profile", auth_middleware_1.authMiddleware, user_controller_1.updateProfile);
userRouter.patch("/upload-avatar", auth_middleware_1.authMiddleware, upload_middleware_1.upload.single("avatar"), user_controller_1.uploadAvatar);
userRouter.patch("/change-password", auth_middleware_1.authMiddleware, user_controller_1.changePassword);
userRouter.post("/change-password/send-otp", auth_middleware_1.authMiddleware, user_controller_1.sendChangePasswordOtp);
// User habits routes
userRouter.get("/habits", auth_middleware_1.authMiddleware, user_habit_controller_1.getUserHabits);
userRouter.patch("/habits", auth_middleware_1.authMiddleware, user_habit_controller_1.updateUserHabits);
userRouter.post("/habits/track", auth_middleware_1.authMiddleware, user_habit_controller_1.trackTaskCompletion);
userRouter.get("/:id", auth_middleware_1.authMiddleware, user_controller_1.getById);
exports.default = userRouter;
