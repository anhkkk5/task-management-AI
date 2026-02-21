import { Router } from "express";
import multer from "multer";
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
  forgotPassword,
  verifyForgotPasswordOtp,
  resetPassword,
  uploadAvatar,
} from "./auth.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const authRouter = Router();

// Multer storage config - store in memory for cloudinary upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

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
authRouter.post(
  "/upload-avatar",
  authMiddleware,
  upload.single("avatar"),
  uploadAvatar,
);

// Forgot password routes
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/verify-forgot-password-otp", verifyForgotPasswordOtp);
authRouter.post("/reset-password", resetPassword);

export default authRouter;
