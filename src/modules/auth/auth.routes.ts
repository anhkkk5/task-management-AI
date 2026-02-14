import { Router } from "express";
import {
  login,
  logout,
  logoutAll,
  me,
  refreshToken,
  register,
  resendOtp,
  sendOtp,
  verifyOtp,
  updateProfile,
} from "./auth.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/send-otp", sendOtp);
authRouter.post("/resend-otp", resendOtp);
authRouter.post("/verify-otp", verifyOtp);
authRouter.post("/login", login);
authRouter.post("/refresh-token", refreshToken);
authRouter.post("/logout", logout);
authRouter.post("/logout-all", authMiddleware, logoutAll);
authRouter.get("/me", authMiddleware, me);
authRouter.patch("/update-profile", authMiddleware, updateProfile);

export default authRouter;
