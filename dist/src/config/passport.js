"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupPassport = void 0;
// Passport configuration for Google OAuth
// Sử dụng cùng hệ thống JWT + Redis refresh token như login thường
const passport_1 = __importDefault(require("passport"));
const passport_google_oauth20_1 = require("passport-google-oauth20");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_model_1 = require("../modules/auth/auth.model");
const redis_service_1 = require("../services/redis.service");
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL ||
    "http://localhost:3002/auth/google/callback";
// ========== JWT helpers (phải ĐỒNG BỘ với auth.service.ts) ==========
const getAccessSecret = () => {
    const raw = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
    if (!raw)
        throw new Error("Missing env JWT_ACCESS_SECRET");
    return raw;
};
const getRefreshSecret = () => {
    const raw = process.env.JWT_REFRESH_SECRET ??
        process.env.JWT_ACCESS_SECRET ??
        process.env.JWT_SECRET;
    if (!raw)
        throw new Error("Missing env JWT_REFRESH_SECRET");
    return raw;
};
const getRefreshTtlSeconds = () => {
    // Hỗ trợ cả 2 tên biến env
    const env = process.env.JWT_REFRESH_TTL_SECONDS ??
        process.env.REFRESH_TOKEN_TTL_SECONDS;
    if (!env)
        return 86400; // default 1 day
    const n = Number(env);
    return Number.isFinite(n) && n > 0 ? n : 86400;
};
// ========== Passport Setup ==========
const setupPassport = () => {
    passport_1.default.use(new passport_google_oauth20_1.Strategy({
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        scope: [
            "profile",
            "email",
            "https://www.googleapis.com/auth/contacts.readonly",
            "https://www.googleapis.com/auth/calendar",
        ],
    }, async (accessToken, _refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
                return done(new Error("No email found in Google profile"), false);
            }
            console.log("[Google Strategy] Processing user:", email);
            // Find or create user
            let user = await auth_model_1.User.findOne({ email });
            if (!user) {
                // Google user không cần mật khẩu, nhưng schema yêu cầu required
                // → Tạo random hash để schema không reject
                const placeholder = `google:${(0, crypto_1.randomUUID)()}`;
                const hash = await bcryptjs_1.default.hash(placeholder, 10);
                user = await auth_model_1.User.create({
                    email,
                    name: profile.displayName || email.split("@")[0],
                    avatar: profile.photos?.[0]?.value,
                    password: hash,
                    role: "user",
                    isVerified: true,
                    googleAccessToken: accessToken,
                });
                console.log("[Google Strategy] Created new user:", email);
            }
            else {
                // Update avatar nếu chưa có + lưu googleAccessToken
                if (profile.photos?.[0]?.value && !user.avatar) {
                    user.avatar = profile.photos[0].value;
                }
                user.googleAccessToken = accessToken;
                await user.save();
                console.log("[Google Strategy] Found existing user:", email);
            }
            const userId = String(user._id);
            // ===== Access Token (ĐÚNG format như auth.service.ts) =====
            const accessExpiresIn = (process.env
                .JWT_ACCESS_EXPIRES_IN ?? "1h");
            const token = jsonwebtoken_1.default.sign({
                userId,
                email: user.email,
                role: user.role,
                googleAccessToken: accessToken,
            }, getAccessSecret(), { expiresIn: accessExpiresIn });
            // ===== Refresh Token + lưu Redis (ĐÚNG như auth.service.ts) =====
            const jti = (0, crypto_1.randomUUID)();
            const refreshExpiresIn = (process.env
                .JWT_REFRESH_EXPIRES_IN ?? "1d");
            const refreshTokenValue = jsonwebtoken_1.default.sign({ userId, email: user.email, role: user.role, jti }, getRefreshSecret(), { expiresIn: refreshExpiresIn });
            const redis = (0, redis_service_1.getRedis)();
            const redisKey = `refresh:${userId}:${jti}`;
            await redis.set(redisKey, "1", "EX", getRefreshTtlSeconds());
            console.log("[Google Strategy] Refresh token saved to Redis:", redisKey);
            return done(null, {
                user,
                token,
                refreshToken: refreshTokenValue,
                googleAccessToken: accessToken,
            });
        }
        catch (error) {
            console.error("[Google Strategy] Error:", error);
            return done(error, false);
        }
    }));
    passport_1.default.serializeUser((user, done) => {
        done(null, user);
    });
    passport_1.default.deserializeUser((obj, done) => {
        done(null, obj);
    });
};
exports.setupPassport = setupPassport;
exports.default = passport_1.default;
