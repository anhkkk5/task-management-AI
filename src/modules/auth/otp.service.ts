import { getRedis } from "../../services/redis.service";

type PendingRegister = {
  email: string;
  passwordHash: string;
  name: string;
  createdAt: number;
};

const OTP_TTL_SECONDS = 300;

const otpKey = (email: string): string => `otp:${email}`;
const pendingKey = (email: string): string => `pending_register:${email}`;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const otpService = {
  generateOtp: (): string => {
    const n = Math.floor(100000 + Math.random() * 900000);
    return String(n);
  },

  saveOtp: async (email: string, otp: string): Promise<void> => {
    const redis = getRedis();
    const key = otpKey(normalizeEmail(email));
    await redis.set(key, otp, "EX", OTP_TTL_SECONDS);
  },

  getOtp: async (email: string): Promise<string | null> => {
    const redis = getRedis();
    const key = otpKey(normalizeEmail(email));
    return redis.get(key);
  },

  deleteOtp: async (email: string): Promise<void> => {
    const redis = getRedis();
    const key = otpKey(normalizeEmail(email));
    await redis.del(key);
  },

  savePendingRegister: async (pending: PendingRegister): Promise<void> => {
    const redis = getRedis();
    const email = normalizeEmail(pending.email);
    const key = pendingKey(email);
    await redis.set(key, JSON.stringify({ ...pending, email }), "EX", OTP_TTL_SECONDS);
  },

  getPendingRegister: async (email: string): Promise<PendingRegister | null> => {
    const redis = getRedis();
    const key = pendingKey(normalizeEmail(email));
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as PendingRegister;
  },

  deletePendingRegister: async (email: string): Promise<void> => {
    const redis = getRedis();
    const key = pendingKey(normalizeEmail(email));
    await redis.del(key);
  },

  verifyOtp: async (email: string, otp: string): Promise<boolean> => {
    const current = await otpService.getOtp(email);
    if (!current) return false;
    return current === otp;
  },

  getOtpTtlSeconds: (): number => OTP_TTL_SECONDS,
};
