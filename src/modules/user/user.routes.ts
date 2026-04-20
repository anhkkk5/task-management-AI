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

// Search user by email (for invite lookup)
userRouter.get(
  "/search/by-email",
  authMiddleware,
  async (req: any, res: any) => {
    try {
      const { email } = req.query as { email: string };
      if (!email) return res.status(400).json({ message: "Email required" });
      const { User } = await import("../auth/auth.model");
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
    } catch {
      res.status(500).json({ message: "Lỗi hệ thống" });
    }
  },
);

export default userRouter;
