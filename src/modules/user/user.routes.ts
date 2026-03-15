import { Router } from "express";
import {
  changePassword,
  sendChangePasswordOtp,
  getById,
  me,
  getNotificationSettings,
  updateNotificationSettings,
  updateProfile,
  uploadAvatar,
} from "./user.controller";
import {
  getUserHabits,
  updateUserHabits,
  trackTaskCompletion,
} from "./user-habit.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { upload } from "../../middleware/upload.middleware";

const userRouter = Router();

userRouter.get("/me", authMiddleware, me);
userRouter.get(
  "/notification-settings",
  authMiddleware,
  getNotificationSettings,
);
userRouter.patch(
  "/notification-settings",
  authMiddleware,
  updateNotificationSettings,
);
userRouter.patch("/update-profile", authMiddleware, updateProfile);
userRouter.patch(
  "/upload-avatar",
  authMiddleware,
  upload.single("avatar"),
  uploadAvatar,
);
userRouter.patch("/change-password", authMiddleware, changePassword);
userRouter.post(
  "/change-password/send-otp",
  authMiddleware,
  sendChangePasswordOtp,
);

// User habits routes
userRouter.get("/habits", authMiddleware, getUserHabits);
userRouter.patch("/habits", authMiddleware, updateUserHabits);
userRouter.post("/habits/track", authMiddleware, trackTaskCompletion);

userRouter.get("/:id", authMiddleware, getById);

export default userRouter;
