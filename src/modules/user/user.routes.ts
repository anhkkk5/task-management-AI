import { Router } from "express";
import {
  changePassword,
  getById,
  me,
  updateProfile,
  uploadAvatar,
} from "./user.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const userRouter = Router();

userRouter.get("/me", authMiddleware, me);
userRouter.patch("/update-profile", authMiddleware, updateProfile);
userRouter.patch("/upload-avatar", authMiddleware, uploadAvatar);
userRouter.patch("/change-password", authMiddleware, changePassword);
userRouter.get("/:id", authMiddleware, getById);

export default userRouter;
