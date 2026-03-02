"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.otpService = void 0;
const redis_service_1 = require("../../services/redis.service");
const OTP_TTL_SECONDS = 300;
const otpKey = (email) => `otp:${email}`;
const pendingKey = (email) => `pending_register:${email}`;
const changePasswordOtpKey = (email) => `otp:change_password:${email}`;
const normalizeEmail = (email) => email.trim().toLowerCase();
exports.otpService = {
    generateOtp: () => {
        const n = Math.floor(100000 + Math.random() * 900000);
        return String(n);
    },
    saveOtp: async (email, otp) => {
        const redis = (0, redis_service_1.getRedis)();
        const key = otpKey(normalizeEmail(email));
        await redis.set(key, otp, "EX", OTP_TTL_SECONDS);
    },
    getOtp: async (email) => {
        const redis = (0, redis_service_1.getRedis)();
        const key = otpKey(normalizeEmail(email));
        return redis.get(key);
    },
    saveChangePasswordOtp: async (email, otp) => {
        const redis = (0, redis_service_1.getRedis)();
        const key = changePasswordOtpKey(normalizeEmail(email));
        await redis.set(key, otp, "EX", OTP_TTL_SECONDS);
    },
    getChangePasswordOtp: async (email) => {
        const redis = (0, redis_service_1.getRedis)();
        const key = changePasswordOtpKey(normalizeEmail(email));
        return redis.get(key);
    },
    deleteChangePasswordOtp: async (email) => {
        const redis = (0, redis_service_1.getRedis)();
        const key = changePasswordOtpKey(normalizeEmail(email));
        await redis.del(key);
    },
    verifyChangePasswordOtp: async (email, otp) => {
        const current = await exports.otpService.getChangePasswordOtp(email);
        if (!current)
            return false;
        return current === otp;
    },
    deleteOtp: async (email) => {
        const redis = (0, redis_service_1.getRedis)();
        const key = otpKey(normalizeEmail(email));
        await redis.del(key);
    },
    savePendingRegister: async (pending) => {
        const redis = (0, redis_service_1.getRedis)();
        const email = normalizeEmail(pending.email);
        const key = pendingKey(email);
        await redis.set(key, JSON.stringify({ ...pending, email }), "EX", OTP_TTL_SECONDS);
    },
    getPendingRegister: async (email) => {
        const redis = (0, redis_service_1.getRedis)();
        const key = pendingKey(normalizeEmail(email));
        const raw = await redis.get(key);
        if (!raw)
            return null;
        return JSON.parse(raw);
    },
    deletePendingRegister: async (email) => {
        const redis = (0, redis_service_1.getRedis)();
        const key = pendingKey(normalizeEmail(email));
        await redis.del(key);
    },
    verifyOtp: async (email, otp) => {
        const current = await exports.otpService.getOtp(email);
        if (!current)
            return false;
        return current === otp;
    },
    getOtpTtlSeconds: () => OTP_TTL_SECONDS,
};
