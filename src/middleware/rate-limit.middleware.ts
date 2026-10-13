import { Request, Response } from "express";
import { rateLimit, Store } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "../services/redis.service";

/**
 * Tạo RedisStore an toàn với cơ chế fallback về MemoryStore nếu Redis không khả dụng
 */
const createSafeStore = (prefix: string): Store | undefined => {
  try {
    const redis = getRedis();
    return new RedisStore({
      sendCommand: (...args: string[]) => (redis.call as any)(...args),
      prefix: `rl:${prefix}:`,
    });
  } catch (error) {
    console.warn(
      `[RateLimit] Không thể kết nối Redis cho store '${prefix}', sử dụng MemoryStore dự phòng.`,
    );
    return undefined;
  }
};

/**
 * 1. Global Rate Limiter: Bảo vệ toàn bộ API chống DoS/DDoS cơ bản
 * 500 requests / 15 phút cho mỗi IP
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: false },
  store: createSafeStore("global"),
  message: {
    success: false,
    message: "Hệ thống đang nhận quá nhiều yêu cầu từ bạn. Vui lòng thử lại sau.",
  },
});

/**
 * 2. Auth Rate Limiter: Bảo vệ các endpoint nhạy cảm chống Brute-force
 * (Đăng nhập, đăng ký, xác thực OTP, quên mật khẩu)
 * 15 requests / 1 phút cho mỗi IP
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: false },
  store: createSafeStore("auth"),
  message: {
    success: false,
    message: "Bạn đã gửi quá nhiều yêu cầu xác thực. Vui lòng đợi 1 phút trước khi thử lại.",
  },
});

/**
 * 3. AI Rate Limiter: Bảo vệ các endpoint gọi LLM (Groq / Gemini)
 * Giới hạn theo User ID nếu đã đăng nhập (fallback về IP nếu chưa đăng nhập)
 * 20 requests / 1 phút
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    keyGeneratorIpFallback: false,
    xForwardedForHeader: false,
    default: false,
  },
  keyGenerator: (req: Request): string => {
    const userId = (req as any).user?.userId;
    if (userId) {
      return `user_${userId}`;
    }
    return req.ip || "unknown";
  },
  store: createSafeStore("ai"),
  message: {
    success: false,
    message: "Bạn đang gửi yêu cầu AI quá nhanh. Vui lòng chờ một chút trước khi tiếp tục.",
  },
});
