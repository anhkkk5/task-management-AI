import { Router } from "express";
import multer from "multer";
import passport from "passport";
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
import {
  getGoogleUserInfo,
  searchContacts,
  getContactByEmail,
  createMeetLink,
  getGoogleStatus,
} from "./google-auth.controller";
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

// Google OAuth routes
authRouter.get(
  "/google",
  passport.authenticate("google", {
    scope: [
      "profile",
      "email",
      "https://www.googleapis.com/auth/contacts.readonly",
      "https://www.googleapis.com/auth/calendar",
    ],
    accessType: "offline",
    prompt: "consent",
  }),
);

authRouter.get(
  "/google/callback",
  passport.authenticate("google", { session: false }),
  (req, res) => {
    const isProduction = process.env.NODE_ENV === "production";
    const user = (req as any).user;
    console.log(
      "[Google Callback] User from passport:",
      user?.email,
      "Token exists:",
      !!user?.token,
    );

    if (user?.token) {
      const frontendBaseUrl =
        process.env.FRONTEND_URL || "http://localhost:5173";
      const redirectUrl = new URL("/auth/google/callback", frontendBaseUrl);
      redirectUrl.hash = `token=${encodeURIComponent(user.token)}`;

      // Clear old cookies first to prevent mixing sessions
      res.clearCookie("token", { path: "/" });
      res.clearCookie("refreshToken", { path: "/auth" });

      // Set httpOnly cookie for access token
      res.cookie("token", user.token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/",
      });

      // Set httpOnly cookie for refresh token (same as normal login)
      if (user.refreshToken) {
        res.cookie("refreshToken", user.refreshToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: "/auth",
        });
      }

      console.log(
        "[Google Callback] Cookies set, redirecting to:",
        redirectUrl.toString(),
      );
      // Redirect with token in hash for mobile fallback (not sent to server logs)
      res.redirect(redirectUrl.toString());
    } else {
      console.log(
        "[Google Callback] No token, redirecting to login with error",
      );
      res.redirect(
        `${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=google_auth_failed`,
      );
    }
  },
);

// Google API proxy routes (require JWT auth)
authRouter.get("/google/status", authMiddleware, getGoogleStatus);
authRouter.get("/google/user", authMiddleware, getGoogleUserInfo);
authRouter.get("/google/contacts/search", authMiddleware, searchContacts);
authRouter.get("/google/contacts/:email", authMiddleware, getContactByEmail);
authRouter.post("/google/meet", authMiddleware, createMeetLink);

export default authRouter;
