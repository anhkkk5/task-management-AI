"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
const user_repository_1 = require("./user.repository");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const redis_service_1 = require("../../services/redis.service");
const otp_service_1 = require("../auth/otp.service");
const email_service_1 = require("../auth/email.service");
const toPublicUser = (u) => {
    return {
        id: String(u._id),
        email: u.email,
        name: u.name,
        role: u.role,
        avatar: u.avatar,
        bio: u.bio,
        phone: u.phone,
        dob: u.dob,
        address: u.address,
        settings: u.settings,
        isVerified: u.isVerified,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
    };
};
const userProfileCacheKey = (userId) => `user:profile:${userId}`;
const getProfileCacheTtlSeconds = () => {
    const min = 600;
    const max = 1800;
    return Math.floor(Math.random() * (max - min + 1)) + min;
};
const parseCachedPublicUser = (raw) => {
    const obj = JSON.parse(raw);
    return {
        ...obj,
        dob: obj.dob ? new Date(obj.dob) : undefined,
        createdAt: new Date(obj.createdAt),
        updatedAt: new Date(obj.updatedAt),
    };
};
const invalidateUserProfileCache = async (userId) => {
    try {
        const redis = (0, redis_service_1.getRedis)();
        await redis.del(userProfileCacheKey(userId));
    }
    catch (_err) {
        return;
    }
};
exports.userService = {
    me: async (userId) => {
        try {
            const redis = (0, redis_service_1.getRedis)();
            const cached = await redis.get(userProfileCacheKey(userId));
            if (cached) {
                return parseCachedPublicUser(cached);
            }
        }
        catch (_err) {
            // ignore cache errors
        }
        const user = await user_repository_1.userRepository.findById(userId);
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }
        const pub = toPublicUser(user);
        try {
            const redis = (0, redis_service_1.getRedis)();
            await redis.set(userProfileCacheKey(userId), JSON.stringify(pub), "EX", getProfileCacheTtlSeconds());
        }
        catch (_err) {
            // ignore cache errors
        }
        return pub;
    },
    getNotificationSettings: async (userId) => {
        const user = await user_repository_1.userRepository.findById(userId);
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }
        const raw = user.settings?.notifications?.reminderMinutes;
        const n = typeof raw === "number" ? raw : Number(raw);
        const reminderMinutes = Number.isFinite(n) ? Math.floor(n) : 5;
        return {
            reminderMinutes: reminderMinutes < 0
                ? 0
                : reminderMinutes > 24 * 60
                    ? 24 * 60
                    : reminderMinutes,
        };
    },
    updateNotificationSettings: async (userId, dto) => {
        const user = await user_repository_1.userRepository.findById(userId);
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }
        const raw = dto.reminderMinutes;
        const n = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(n)) {
            throw new Error("INVALID_REMINDER_MINUTES");
        }
        const reminderMinutes = Math.min(24 * 60, Math.max(0, Math.floor(n)));
        const existingSettings = (user.settings || {});
        const existingNotifications = existingSettings.notifications ||
            {};
        const nextSettings = {
            ...existingSettings,
            notifications: {
                ...existingNotifications,
                reminderMinutes,
            },
        };
        const updated = await user_repository_1.userRepository.updateProfile(userId, {
            settings: nextSettings,
        });
        if (!updated) {
            throw new Error("USER_NOT_FOUND");
        }
        await invalidateUserProfileCache(userId);
        return { reminderMinutes };
    },
    updateProfile: async (userId, dto) => {
        const name = dto.name?.trim();
        const bio = dto.bio?.trim();
        const phone = dto.phone?.trim();
        const address = dto.address?.trim();
        const settings = dto.settings;
        const dob = dto.dob;
        if (name !== undefined && name.length === 0) {
            throw new Error("INVALID_NAME");
        }
        const updated = await user_repository_1.userRepository.updateProfile(userId, {
            name,
            bio,
            phone,
            dob,
            address,
            settings,
        });
        if (!updated) {
            throw new Error("USER_NOT_FOUND");
        }
        await invalidateUserProfileCache(userId);
        return toPublicUser(updated);
    },
    uploadAvatar: async (userId, avatarUrl) => {
        const updated = await user_repository_1.userRepository.updateAvatar(userId, avatarUrl);
        if (!updated) {
            throw new Error("USER_NOT_FOUND");
        }
        await invalidateUserProfileCache(userId);
        return toPublicUser(updated);
    },
    changePassword: async (userId, dto) => {
        const oldPassword = dto.oldPassword;
        const newPassword = dto.newPassword;
        if (!oldPassword || !newPassword) {
            throw new Error("INVALID_INPUT");
        }
        if (newPassword.length < 6) {
            throw new Error("INVALID_PASSWORD");
        }
        const user = await user_repository_1.userRepository.findByIdWithPassword(userId);
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }
        const ok = await bcryptjs_1.default.compare(oldPassword, user.password);
        if (!ok) {
            throw new Error("OLD_PASSWORD_INCORRECT");
        }
        const saltRounds = process.env.BCRYPT_SALT_ROUNDS
            ? Number(process.env.BCRYPT_SALT_ROUNDS)
            : 10;
        const hashed = await bcryptjs_1.default.hash(newPassword, saltRounds);
        await user_repository_1.userRepository.updatePassword(userId, hashed);
        const redis = (0, redis_service_1.getRedis)();
        const prefix = `refresh:${userId}:`;
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
        return { message: "Đổi mật khẩu thành công" };
    },
    sendChangePasswordOtp: async (userId) => {
        const user = await user_repository_1.userRepository.findById(userId);
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }
        const otp = otp_service_1.otpService.generateOtp();
        await otp_service_1.otpService.saveChangePasswordOtp(user.email, otp);
        await email_service_1.emailService.sendChangePasswordOtpEmail(user.email, otp);
        return {
            message: "Đã gửi OTP",
            ttlSeconds: otp_service_1.otpService.getOtpTtlSeconds(),
        };
    },
    verifyChangePasswordOtp: async (userId, dto) => {
        const otp = dto.otp?.trim();
        const newPassword = dto.newPassword;
        if (!otp || !newPassword) {
            throw new Error("INVALID_INPUT");
        }
        if (!/^\d{6}$/.test(otp)) {
            throw new Error("INVALID_OTP");
        }
        if (newPassword.length < 6) {
            throw new Error("INVALID_PASSWORD");
        }
        const user = await user_repository_1.userRepository.findById(userId);
        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }
        const ok = await otp_service_1.otpService.verifyChangePasswordOtp(user.email, otp);
        if (!ok) {
            throw new Error("OTP_INVALID_OR_EXPIRED");
        }
        const saltRounds = process.env.BCRYPT_SALT_ROUNDS
            ? Number(process.env.BCRYPT_SALT_ROUNDS)
            : 10;
        const hashed = await bcryptjs_1.default.hash(newPassword, saltRounds);
        await user_repository_1.userRepository.updatePassword(userId, hashed);
        await otp_service_1.otpService.deleteChangePasswordOtp(user.email);
        const redis = (0, redis_service_1.getRedis)();
        const prefix = `refresh:${userId}:`;
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
        await invalidateUserProfileCache(userId);
        return { message: "Đổi mật khẩu thành công" };
    },
};
