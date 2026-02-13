import { Router } from "express";
import {
  login,
  me,
  register,
  resendOtp,
  sendOtp,
  updateProfile,
} from "./auth.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/send-otp", sendOtp);
authRouter.post("/resend-otp", resendOtp);
authRouter.post("/login", login);
authRouter.get("/me", authMiddleware, me);
authRouter.patch("/update-profile", authMiddleware, updateProfile);

export default authRouter;
