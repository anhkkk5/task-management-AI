"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = require("crypto");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const auth_repository_1 = require("./auth.repository");
const otp_service_1 = require("./otp.service");
const email_service_1 = require("./email.service");
const redis_service_1 = require("../../services/redis.service");
const cloudinary_service_1 = require("../../services/cloudinary.service");
const signAccessToken = (payload) => {
    const rawSecret = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
    if (!rawSecret) {
        throw new Error("Missing env JWT_ACCESS_SECRET");
    }
    const secret = rawSecret;
    const expiresIn = (process.env
        .JWT_ACCESS_EXPIRES_IN ?? "1h");
    return jsonwebtoken_1.default.sign(payload, secret, { expiresIn });
};
const getRefreshSecret = () => {
    const rawSecret = process.env.JWT_REFRESH_SECRET ??
        process.env.JWT_ACCESS_SECRET ??
        process.env.JWT_SECRET;
    if (!rawSecret) {
        throw new Error("Missing env JWT_REFRESH_SECRET");
    }
    return rawSecret;
};
const getRefreshExpiresIn = () => {
    return (process.env.JWT_REFRESH_EXPIRES_IN ??
        "1d");
};
const getRefreshTtlSeconds = () => {
    const env = process.env.JWT_REFRESH_TTL_SECONDS;
    if (!env)
        return 60 * 60 * 24;
    const n = Number(env);
    return Number.isFinite(n) && n > 0 ? n : 60 * 60 * 24;
};
const signRefreshToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, getRefreshSecret(), {
        expiresIn: getRefreshExpiresIn(),
    });
};
const getRefreshKey = (jti) => {
    return `refresh:${jti}`;
};
const getRefreshKeyByUser = (userId, jti) => {
    return `refresh:${userId}:${jti}`;
};
const getRefreshUserPrefix = (userId) => {
    return `refresh:${userId}:`;
};
const getLoginRateLimitMaxAttempts = () => {
    const env = process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
    if (!env)
        return 5;
    const n = Number(env);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
};
const getLoginRateLimitWindowSeconds = () => {
    const env = process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS;
    if (!env)
        return 10 * 60;
    const n = Number(env);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10 * 60;
};
const getLoginRateLimitKey = (ip, email) => {
    const safeIp = ip || "unknown";
    const safeEmail = email || "unknown";
    return `login_rl:${safeIp}:${safeEmail}`;
};
const toPublicUser = (u) => {
    return {
        id: String(u._id),
        email: u.email,
        name: u.name,
        role: u.role,
        avatar: u.avatar,
        isVerified: u.isVerified,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
    };
};
const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};
exports.authService = {
    getRefreshCookieMaxAgeMs: () => {
        return getRefreshTtlSeconds() * 1000;
    },
    register: async (dto) => {
        const email = dto.email?.trim().toLowerCase();
        const password = dto.password;
        const name = dto.name?.trim();
        if (!email || !password || !name) {
            throw new Error("INVALID_INPUT");
        }
        if (!isValidEmail(email)) {
            throw new Error("INVALID_EMAIL");
        }
        if (password.length < 6) {
            throw new Error("INVALID_PASSWORD");
        }
        const existing = await auth_repository_1.authRepository.findByEmail(email);
        if (existing) {
            throw new Error("EMAIL_EXISTS");
        }
        const saltRounds = process.env.BCRYPT_SALT_ROUNDS
            ? Number(process.env.BCRYPT_SALT_ROUNDS)
            : 10;
        const hashed = await bcryptjs_1.default.hash(password, saltRounds);
        await otp_service_1.otpService.savePendingRegister({
            email,
            passwordHash: hashed,
            name,
            createdAt: Date.now(),
        });
        const otp = otp_service_1.otpService.generateOtp();
        await otp_service_1.otpService.saveOtp(email, otp);
        await email_service_1.emailService.sendOtpEmail(email, otp);
        return {
            message: "Vui lòng kiểm tra email và xác thực OTP",
            ttlSeconds: otp_service_1.otpService.getOtpTtlSeconds(),
        };
    },
    sendOtp: async (dto) => {
        const email = dto.email?.trim().toLowerCase();
        if (!email) {
            throw new Error("INVALID_INPUT");
        }
        if (!isValidEmail(email)) {
            throw new Error("INVALID_EMAIL");
        }
        const pending = await otp_service_1.otpService.getPendingRegister(email);
        if (!pending) {
            throw new Error("PENDING_NOT_FOUND");
        }
        const otp = otp_service_1.otpService.generateOtp();
        await otp_service_1.otpService.saveOtp(email, otp);
        await email_service_1.emailService.sendOtpEmail(email, otp);
        return {
            message: "Đã gửi OTP",
            ttlSeconds: otp_service_1.otpService.getOtpTtlSeconds(),
        };
    },
    resendOtp: async (dto) => {
        return exports.authService.sendOtp(dto);
    },
    verifyOtp: async (dto) => {
        const email = dto.email?.trim().toLowerCase();
        const otp = dto.otp?.trim();
        if (!email || !otp) {
            throw new Error("INVALID_INPUT");
        }
        if (!isValidEmail(email)) {
            throw new Error("INVALID_EMAIL");
        }
        if (!/^\d{6}$/.test(otp)) {
            throw new Error("INVALID_OTP");
        }
        const pending = await otp_service_1.otpService.getPendingRegister(email);
        if (!pending) {
            throw new Error("PENDING_NOT_FOUND");
        }
        const ok = await otp_service_1.otpService.verifyOtp(email, otp);
        if (!ok) {
            throw new Error("OTP_INVALID_OR_EXPIRED");
        }
        const existing = await auth_repository_1.authRepository.findByEmail(email);
        if (existing) {
            await otp_service_1.otpService.deleteOtp(email);
            await otp_service_1.otpService.deletePendingRegister(email);
            throw new Error("EMAIL_EXISTS");
        }
        await auth_repository_1.authRepository.createUser({
            email,
            password: pending.passwordHash,
            name: pending.name,
            role: "user",
            isVerified: true,
        });
        await otp_service_1.otpService.deleteOtp(email);
        await otp_service_1.otpService.deletePendingRegister(email);
        return { message: "Xác thực OTP thành công" };
    },
    login: async (dto) => {
        const email = dto.email?.trim().toLowerCase();
        const password = dto.password;
        const ip = dto.ip?.trim() || "unknown";
        if (!email || !password) {
            throw new Error("INVALID_INPUT");
        }
        if (!isValidEmail(email)) {
            throw new Error("INVALID_EMAIL");
        }
        const redis = (0, redis_service_1.getRedis)();
        const rlKey = getLoginRateLimitKey(ip, email);
        const attempts = await redis.incr(rlKey);
        if (attempts === 1) {
            await redis.expire(rlKey, getLoginRateLimitWindowSeconds());
        }
        if (attempts > getLoginRateLimitMaxAttempts()) {
            throw new Error("TOO_MANY_ATTEMPTS");
        }
        const user = await auth_repository_1.authRepository.findByEmailWithPassword(email);
        if (!user) {
            throw new Error("INVALID_CREDENTIALS");
        }
        if (!user.isVerified) {
            throw new Error("EMAIL_NOT_VERIFIED");
        }
        const ok = await bcryptjs_1.default.compare(password, user.password);
        if (!ok) {
            throw new Error("INVALID_CREDENTIALS");
        }
        await redis.del(rlKey);
        // Clean up old refresh tokens for this user before creating new one
        const userId = String(user._id);
        const prefix = getRefreshUserPrefix(userId);
        const oldKeys = [];
        let cursor = "0";
        do {
            const [next, batch] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
            cursor = next;
            if (Array.isArray(batch) && batch.length) {
                oldKeys.push(...batch);
            }
        } while (cursor !== "0");
        if (oldKeys.length) {
            await redis.del(...oldKeys);
        }
        const accessToken = signAccessToken({
            userId,
            email: user.email,
            role: user.role,
        });
        const jti = (0, crypto_1.randomUUID)();
        const refreshToken = signRefreshToken({
            userId,
            email: user.email,
            role: user.role,
            jti,
        });
        await redis.set(getRefreshKeyByUser(userId, jti), "1", "EX", getRefreshTtlSeconds());
        return {
            accessToken,
            refreshToken,
            user: toPublicUser(user),
        };
    },
    refreshToken: async (dto) => {
        const token = dto.refreshToken?.trim();
        if (!token) {
            throw new Error("INVALID_INPUT");
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, getRefreshSecret());
        }
        catch (_err) {
            throw new Error("REFRESH_TOKEN_INVALID");
        }
        if (!payload?.userId || !payload.email || !payload.role || !payload.jti) {
            throw new Error("REFRESH_TOKEN_INVALID");
        }
        const redis = (0, redis_service_1.getRedis)();
        const key = getRefreshKeyByUser(payload.userId, payload.jti);
        const exists = await redis.get(key);
        if (!exists) {
            throw new Error("REFRESH_TOKEN_REVOKED");
        }
        await redis.del(key);
        const user = await auth_repository_1.authRepository.findById(payload.userId);
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }
        const accessToken = signAccessToken({
            userId: String(user._id),
            email: user.email,
            role: user.role,
        });
        const newJti = (0, crypto_1.randomUUID)();
        const refreshToken = signRefreshToken({
            userId: String(user._id),
            email: user.email,
            role: user.role,
            jti: newJti,
        });
        await redis.set(getRefreshKeyByUser(String(user._id), newJti), "1", "EX", getRefreshTtlSeconds());
        return { accessToken, refreshToken };
    },
    logout: async (dto) => {
        const token = dto.refreshToken?.trim();
        if (!token) {
            throw new Error("INVALID_INPUT");
        }
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, getRefreshSecret());
        }
        catch (_err) {
            throw new Error("REFRESH_TOKEN_INVALID");
        }
        if (!payload?.userId || !payload.jti) {
            throw new Error("REFRESH_TOKEN_INVALID");
        }
        const redis = (0, redis_service_1.getRedis)();
        await redis.del(getRefreshKeyByUser(payload.userId, payload.jti));
        return { message: "Đăng xuất thành công" };
    },
    logoutAll: async (userId) => {
        const redis = (0, redis_service_1.getRedis)();
        const prefix = getRefreshUserPrefix(userId);
        const keys = [];
        let cursor = "0";
        do {
            const [next, batch] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
            cursor = next;
            if (Array.isArray(batch) && batch.length) {
                keys.push(...batch);
            }
        } while (cursor !== "0");
        if (keys.length) {
            await redis.del(...keys);
        }
        return { message: "Đăng xuất tất cả thiết bị thành công" };
    },
    updateProfile: async (userId, dto) => {
        const name = dto.name?.trim();
        const avatar = dto.avatar?.trim();
        if (name !== undefined && name.length === 0) {
            throw new Error("INVALID_NAME");
        }
        const updated = await auth_repository_1.authRepository.updateProfile(userId, {
            name,
            avatar,
        });
        if (!updated) {
            throw new Error("USER_NOT_FOUND");
        }
        return toPublicUser(updated);
    },
    uploadAvatar: async (userId, file) => {
        if (!file) {
            throw new Error("INVALID_INPUT");
        }
        // Validate file type
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
        if (!allowedTypes.includes(file.mimetype)) {
            throw new Error("INVALID_FILE_TYPE");
        }
        // Validate file size (5MB)
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            throw new Error("FILE_TOO_LARGE");
        }
        // Upload to Cloudinary
        const result = await (0, cloudinary_service_1.uploadImageBuffer)(file.buffer, {
            folder: "avatars",
            publicId: `user_${userId}_${Date.now()}`,
        });
        if (!result?.url) {
            throw new Error("UPLOAD_FAILED");
        }
        // Update user avatar in database
        await auth_repository_1.authRepository.updateProfile(userId, { avatar: result.url });
        return result.url;
    },
    // Forgot Password Flow
    forgotPassword: async (email) => {
        const normalizedEmail = email?.trim().toLowerCase();
        if (!normalizedEmail) {
            throw new Error("INVALID_INPUT");
        }
        if (!isValidEmail(normalizedEmail)) {
            throw new Error("INVALID_EMAIL");
        }
        const user = await auth_repository_1.authRepository.findByEmail(normalizedEmail);
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }
        const otp = otp_service_1.otpService.generateOtp();
        await otp_service_1.otpService.saveChangePasswordOtp(normalizedEmail, otp);
        await email_service_1.emailService.sendChangePasswordOtpEmail(normalizedEmail, otp);
        return {
            message: "Mã OTP đã được gửi đến email của bạn",
            ttlSeconds: otp_service_1.otpService.getOtpTtlSeconds(),
        };
    },
    verifyForgotPasswordOtp: async (email, otp) => {
        const normalizedEmail = email?.trim().toLowerCase();
        const normalizedOtp = otp?.trim();
        if (!normalizedEmail || !normalizedOtp) {
            throw new Error("INVALID_INPUT");
        }
        if (!isValidEmail(normalizedEmail)) {
            throw new Error("INVALID_EMAIL");
        }
        if (!/^\d{6}$/.test(normalizedOtp)) {
            throw new Error("INVALID_OTP");
        }
        const user = await auth_repository_1.authRepository.findByEmail(normalizedEmail);
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }
        const ok = await otp_service_1.otpService.verifyChangePasswordOtp(normalizedEmail, normalizedOtp);
        if (!ok) {
            throw new Error("OTP_INVALID_OR_EXPIRED");
        }
        return { message: "Xác thực OTP thành công" };
    },
    resetPassword: async (email, otp, newPassword) => {
        const normalizedEmail = email?.trim().toLowerCase();
        const normalizedOtp = otp?.trim();
        if (!normalizedEmail || !normalizedOtp || !newPassword) {
            throw new Error("INVALID_INPUT");
        }
        if (!isValidEmail(normalizedEmail)) {
            throw new Error("INVALID_EMAIL");
        }
        if (!/^\d{6}$/.test(normalizedOtp)) {
            throw new Error("INVALID_OTP");
        }
        if (newPassword.length < 6) {
            throw new Error("INVALID_PASSWORD");
        }
        const user = await auth_repository_1.authRepository.findByEmail(normalizedEmail);
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }
        const ok = await otp_service_1.otpService.verifyChangePasswordOtp(normalizedEmail, normalizedOtp);
        if (!ok) {
            throw new Error("OTP_INVALID_OR_EXPIRED");
        }
        const saltRounds = process.env.BCRYPT_SALT_ROUNDS
            ? Number(process.env.BCRYPT_SALT_ROUNDS)
            : 10;
        const hashed = await bcryptjs_1.default.hash(newPassword, saltRounds);
        await auth_repository_1.authRepository.updatePassword(String(user._id), hashed);
        await otp_service_1.otpService.deleteChangePasswordOtp(normalizedEmail);
        return { message: "Đặt lại mật khẩu thành công" };
    },
    // ✅ NEW: Public method to generate access token (for Google OAuth callback)
    generateAccessToken: (payload) => {
        return signAccessToken(payload);
    },
};
