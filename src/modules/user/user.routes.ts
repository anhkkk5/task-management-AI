import { Router } from "express";
import {
  changePassword,
  sendChangePasswordOtp,
  getById,
  me,
  updateProfile,
  uploadAvatar,
} from "./user.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { upload } from "../../middleware/upload.middleware";

const userRouter = Router();

userRouter.get("/me", authMiddleware, me);
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
userRouter.get("/:id", authMiddleware, getById);

export default userRouter;
