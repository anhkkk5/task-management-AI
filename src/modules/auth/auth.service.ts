import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { authRepository } from "./auth.repository";
import {
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  SendOtpDto,
  UpdateProfileDto,
  VerifyOtpDto,
} from "./auth.dto";
import { UserRole } from "./auth.model";
import { otpService } from "./otp.service";
import { emailService } from "./email.service";
import { getRedis } from "../../services/redis.service";

type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type RegisterResult = {
  message: string;
  ttlSeconds: number;
};

type LoginResult = {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
};

type RefreshTokenResult = {
  accessToken: string;
  refreshToken: string;
};

type VerifyOtpResult = {
  message: string;
};

const signAccessToken = (payload: {
  userId: string;
  email: string;
  role: UserRole;
}): string => {
  const rawSecret = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
  if (!rawSecret) {
    throw new Error("Missing env JWT_ACCESS_SECRET");
  }

  const secret: Secret = rawSecret;
  const expiresIn: SignOptions["expiresIn"] = (process.env
    .JWT_ACCESS_EXPIRES_IN ?? "1h") as SignOptions["expiresIn"];

  return jwt.sign(payload, secret, { expiresIn });
};

const getRefreshSecret = (): Secret => {
  const rawSecret =
    process.env.JWT_REFRESH_SECRET ??
    process.env.JWT_ACCESS_SECRET ??
    process.env.JWT_SECRET;
  if (!rawSecret) {
    throw new Error("Missing env JWT_REFRESH_SECRET");
  }
  return rawSecret;
};

const getRefreshExpiresIn = (): SignOptions["expiresIn"] => {
  return (process.env.JWT_REFRESH_EXPIRES_IN ??
    "1d") as SignOptions["expiresIn"];
};

const getRefreshTtlSeconds = (): number => {
  const env = process.env.JWT_REFRESH_TTL_SECONDS;
  if (!env) return 60 * 60 * 24;
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : 60 * 60 * 24;
};

const signRefreshToken = (payload: {
  userId: string;
  email: string;
  role: UserRole;
  jti: string;
}): string => {
  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: getRefreshExpiresIn(),
  });
};

const getRefreshKey = (jti: string): string => {
  return `refresh:${jti}`;
};

const getRefreshKeyByUser = (userId: string, jti: string): string => {
  return `refresh:${userId}:${jti}`;
};

const getRefreshUserPrefix = (userId: string): string => {
  return `refresh:${userId}:`;
};

const toPublicUser = (u: {
  _id: unknown;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}): PublicUser => {
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

const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const authService = {
  getRefreshCookieMaxAgeMs: (): number => {
    return getRefreshTtlSeconds() * 1000;
  },

  register: async (dto: RegisterDto): Promise<RegisterResult> => {
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

    const existing = await authRepository.findByEmail(email);
    if (existing) {
      throw new Error("EMAIL_EXISTS");
    }

    const saltRounds = process.env.BCRYPT_SALT_ROUNDS
      ? Number(process.env.BCRYPT_SALT_ROUNDS)
      : 10;
    const hashed = await bcrypt.hash(password, saltRounds);

    await otpService.savePendingRegister({
      email,
      passwordHash: hashed,
      name,
      createdAt: Date.now(),
    });

    const otp = otpService.generateOtp();
    await otpService.saveOtp(email, otp);
    await emailService.sendOtpEmail(email, otp);

    return {
      message: "Vui lòng kiểm tra email và xác thực OTP",
      ttlSeconds: otpService.getOtpTtlSeconds(),
    };
  },

  sendOtp: async (
    dto: SendOtpDto,
  ): Promise<{ message: string; ttlSeconds: number }> => {
    const email = dto.email?.trim().toLowerCase();
    if (!email) {
      throw new Error("INVALID_INPUT");
    }
    if (!isValidEmail(email)) {
      throw new Error("INVALID_EMAIL");
    }

    const pending = await otpService.getPendingRegister(email);
    if (!pending) {
      throw new Error("PENDING_NOT_FOUND");
    }

    const otp = otpService.generateOtp();
    await otpService.saveOtp(email, otp);
    await emailService.sendOtpEmail(email, otp);

    return {
      message: "Đã gửi OTP",
      ttlSeconds: otpService.getOtpTtlSeconds(),
    };
  },

  resendOtp: async (
    dto: SendOtpDto,
  ): Promise<{ message: string; ttlSeconds: number }> => {
    return authService.sendOtp(dto);
  },

  verifyOtp: async (dto: VerifyOtpDto): Promise<VerifyOtpResult> => {
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

    const pending = await otpService.getPendingRegister(email);
    if (!pending) {
      throw new Error("PENDING_NOT_FOUND");
    }

    const ok = await otpService.verifyOtp(email, otp);
    if (!ok) {
      throw new Error("OTP_INVALID_OR_EXPIRED");
    }

    const existing = await authRepository.findByEmail(email);
    if (existing) {
      await otpService.deleteOtp(email);
      await otpService.deletePendingRegister(email);
      throw new Error("EMAIL_EXISTS");
    }

    await authRepository.createUser({
      email,
      password: pending.passwordHash,
      name: pending.name,
      role: "user",
      isVerified: true,
    });

    await otpService.deleteOtp(email);
    await otpService.deletePendingRegister(email);

    return { message: "Xác thực OTP thành công" };
  },

  login: async (dto: LoginDto): Promise<LoginResult> => {
    const email = dto.email?.trim().toLowerCase();
    const password = dto.password;

    if (!email || !password) {
      throw new Error("INVALID_INPUT");
    }
    if (!isValidEmail(email)) {
      throw new Error("INVALID_EMAIL");
    }

    const user = await authRepository.findByEmailWithPassword(email);
    if (!user) {
      throw new Error("INVALID_CREDENTIALS");
    }

    if (!user.isVerified) {
      throw new Error("EMAIL_NOT_VERIFIED");
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new Error("INVALID_CREDENTIALS");
    }

    const accessToken = signAccessToken({
      userId: String(user._id),
      email: user.email,
      role: user.role,
    });

    const jti = randomUUID();
    const refreshToken = signRefreshToken({
      userId: String(user._id),
      email: user.email,
      role: user.role,
      jti,
    });

    const redis = getRedis();
    await redis.set(
      getRefreshKeyByUser(String(user._id), jti),
      "1",
      "EX",
      getRefreshTtlSeconds(),
    );

    return {
      accessToken,
      refreshToken,
      user: toPublicUser(user),
    };
  },

  refreshToken: async (dto: RefreshTokenDto): Promise<RefreshTokenResult> => {
    const token = dto.refreshToken?.trim();
    if (!token) {
      throw new Error("INVALID_INPUT");
    }

    type RefreshPayload = {
      userId: string;
      email: string;
      role: UserRole;
      jti: string;
    };

    let payload: RefreshPayload;
    try {
      payload = jwt.verify(token, getRefreshSecret()) as RefreshPayload;
    } catch (_err) {
      throw new Error("REFRESH_TOKEN_INVALID");
    }

    if (!payload?.userId || !payload.email || !payload.role || !payload.jti) {
      throw new Error("REFRESH_TOKEN_INVALID");
    }

    const redis = getRedis();
    const key = getRefreshKeyByUser(payload.userId, payload.jti);
    const exists = await redis.get(key);
    if (!exists) {
      throw new Error("REFRESH_TOKEN_REVOKED");
    }

    await redis.del(key);

    const user = await authRepository.findById(payload.userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const accessToken = signAccessToken({
      userId: String(user._id),
      email: user.email,
      role: user.role,
    });

    const newJti = randomUUID();
    const refreshToken = signRefreshToken({
      userId: String(user._id),
      email: user.email,
      role: user.role,
      jti: newJti,
    });

    await redis.set(
      getRefreshKeyByUser(String(user._id), newJti),
      "1",
      "EX",
      getRefreshTtlSeconds(),
    );

    return { accessToken, refreshToken };
  },

  logout: async (dto: RefreshTokenDto): Promise<{ message: string }> => {
    const token = dto.refreshToken?.trim();
    if (!token) {
      throw new Error("INVALID_INPUT");
    }

    type RefreshPayload = {
      userId: string;
      email: string;
      role: UserRole;
      jti: string;
    };

    let payload: RefreshPayload;
    try {
      payload = jwt.verify(token, getRefreshSecret()) as RefreshPayload;
    } catch (_err) {
      throw new Error("REFRESH_TOKEN_INVALID");
    }

    if (!payload?.userId || !payload.jti) {
      throw new Error("REFRESH_TOKEN_INVALID");
    }

    const redis = getRedis();
    await redis.del(getRefreshKeyByUser(payload.userId, payload.jti));
    return { message: "Đăng xuất thành công" };
  },

  logoutAll: async (userId: string): Promise<{ message: string }> => {
    const redis = getRedis();
    const prefix = getRefreshUserPrefix(userId);
    const keys: string[] = [];

    let cursor = "0";
    do {
      const [next, batch] = await redis.scan(
        cursor,
        "MATCH",
        `${prefix}*`,
        "COUNT",
        200,
      );
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

  updateProfile: async (
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<PublicUser> => {
    const name = dto.name?.trim();
    const avatar = dto.avatar?.trim();

    if (name !== undefined && name.length === 0) {
      throw new Error("INVALID_NAME");
    }

    const updated = await authRepository.updateProfile(userId, {
      name,
      avatar,
    });
    if (!updated) {
      throw new Error("USER_NOT_FOUND");
    }

    return toPublicUser(updated);
  },
};
