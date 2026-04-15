"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const passport_1 = __importDefault(require("passport"));
const auth_controller_1 = require("./auth.controller");
const google_auth_controller_1 = require("./google-auth.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const authRouter = (0, express_1.Router)();
// Multer storage config - store in memory for cloudinary upload
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});
authRouter.post("/register", auth_controller_1.register);
authRouter.post("/send-otp", auth_controller_1.sendOtp);
authRouter.post("/resend-otp", auth_controller_1.resendOtp);
authRouter.post("/verify-otp", auth_controller_1.verifyOtp);
authRouter.post("/login", auth_controller_1.login);
authRouter.post("/refresh-token", auth_controller_1.refreshToken);
authRouter.post("/logout", auth_controller_1.logout);
authRouter.post("/logout-all", auth_middleware_1.authMiddleware, auth_controller_1.logoutAll);
authRouter.get("/me", auth_middleware_1.authMiddleware, auth_controller_1.me);
authRouter.patch("/update-profile", auth_middleware_1.authMiddleware, auth_controller_1.updateProfile);
authRouter.post("/upload-avatar", auth_middleware_1.authMiddleware, upload.single("avatar"), auth_controller_1.uploadAvatar);
// Forgot password routes
authRouter.post("/forgot-password", auth_controller_1.forgotPassword);
authRouter.post("/verify-forgot-password-otp", auth_controller_1.verifyForgotPasswordOtp);
authRouter.post("/reset-password", auth_controller_1.resetPassword);
// Google OAuth routes
authRouter.get("/google", passport_1.default.authenticate("google", {
    scope: [
        "profile",
        "email",
        "https://www.googleapis.com/auth/contacts.readonly",
        "https://www.googleapis.com/auth/calendar",
    ],
    accessType: "offline",
    prompt: "consent",
}));
authRouter.get("/google/callback", passport_1.default.authenticate("google", { session: false }), (req, res) => {
    const user = req.user;
    console.log("[Google Callback] User from passport:", user?.email, "Token exists:", !!user?.token);
    if (user?.token) {
        // Clear old cookies first to prevent mixing sessions
        res.clearCookie("token", { path: "/" });
        res.clearCookie("refreshToken", { path: "/auth" });
        // Set httpOnly cookie for access token
        res.cookie("token", user.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: "/",
        });
        // Set httpOnly cookie for refresh token (same as normal login)
        if (user.refreshToken) {
            res.cookie("refreshToken", user.refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: "/auth",
            });
        }
        console.log("[Google Callback] Cookies set, redirecting to:", `${process.env.FRONTEND_URL || "http://localhost:5173"}/auth/google/callback`);
        // Redirect without token in URL
        res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/auth/google/callback`);
    }
    else {
        console.log("[Google Callback] No token, redirecting to login with error");
        res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/login?error=google_auth_failed`);
    }
});
// Google API proxy routes (require JWT auth)
authRouter.get("/google/status", auth_middleware_1.authMiddleware, google_auth_controller_1.getGoogleStatus);
authRouter.get("/google/user", auth_middleware_1.authMiddleware, google_auth_controller_1.getGoogleUserInfo);
authRouter.get("/google/contacts/search", auth_middleware_1.authMiddleware, google_auth_controller_1.searchContacts);
authRouter.get("/google/contacts/:email", auth_middleware_1.authMiddleware, google_auth_controller_1.getContactByEmail);
authRouter.post("/google/meet", auth_middleware_1.authMiddleware, google_auth_controller_1.createMeetLink);
exports.default = authRouter;
