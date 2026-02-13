import bcrypt from "bcryptjs";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { authRepository } from "./auth.repository";
import {
  LoginDto,
  RegisterDto,
  SendOtpDto,
  UpdateProfileDto,
} from "./auth.dto";
import { UserRole } from "./auth.model";
import { otpService } from "./otp.service";
import { emailService } from "./email.service";

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
  user: PublicUser;
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

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new Error("INVALID_CREDENTIALS");
    }

    const accessToken = signAccessToken({
      userId: String(user._id),
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: toPublicUser(user),
    };
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
