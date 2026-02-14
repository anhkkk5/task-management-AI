import { UserRole } from "../auth/auth.model";
import { userRepository } from "./user.repository";
import bcrypt from "bcryptjs";
import {
  ChangePasswordDto,
  UpdateUserProfileDto,
  VerifyChangePasswordOtpDto,
} from "./user.dto";
import { getRedis } from "../../services/redis.service";
import { otpService } from "../auth/otp.service";
import { emailService } from "../auth/email.service";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  bio?: string;
  phone?: string;
  dob?: Date;
  address?: string;
  settings?: Record<string, unknown>;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const toPublicUser = (u: {
  _id: unknown;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
  bio?: string;
  phone?: string;
  dob?: Date;
  address?: string;
  settings?: Record<string, unknown>;
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

export const userService = {
  me: async (userId: string): Promise<PublicUser> => {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    return toPublicUser(user);
  },

  updateProfile: async (
    userId: string,
    dto: UpdateUserProfileDto,
  ): Promise<PublicUser> => {
    const name = dto.name?.trim();
    const bio = dto.bio?.trim();
    const phone = dto.phone?.trim();
    const address = dto.address?.trim();
    const settings = dto.settings;
    const dob = dto.dob;

    if (name !== undefined && name.length === 0) {
      throw new Error("INVALID_NAME");
    }

    const updated = await userRepository.updateProfile(userId, {
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

    return toPublicUser(updated);
  },

  uploadAvatar: async (
    userId: string,
    avatarUrl: string,
  ): Promise<PublicUser> => {
    const updated = await userRepository.updateAvatar(userId, avatarUrl);
    if (!updated) {
      throw new Error("USER_NOT_FOUND");
    }
    return toPublicUser(updated);
  },

  changePassword: async (
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> => {
    const oldPassword = dto.oldPassword;
    const newPassword = dto.newPassword;

    if (!oldPassword || !newPassword) {
      throw new Error("INVALID_INPUT");
    }
    if (newPassword.length < 6) {
      throw new Error("INVALID_PASSWORD");
    }

    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) {
      throw new Error("OLD_PASSWORD_INCORRECT");
    }

    const saltRounds = process.env.BCRYPT_SALT_ROUNDS
      ? Number(process.env.BCRYPT_SALT_ROUNDS)
      : 10;
    const hashed = await bcrypt.hash(newPassword, saltRounds);

    await userRepository.updatePassword(userId, hashed);

    const redis = getRedis();
    const prefix = `refresh:${userId}:`;
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

    return { message: "Đổi mật khẩu thành công" };
  },

  sendChangePasswordOtp: async (
    userId: string,
  ): Promise<{ message: string; ttlSeconds: number }> => {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const otp = otpService.generateOtp();
    await otpService.saveChangePasswordOtp(user.email, otp);
    await emailService.sendChangePasswordOtpEmail(user.email, otp);

    return {
      message: "Đã gửi OTP",
      ttlSeconds: otpService.getOtpTtlSeconds(),
    };
  },

  verifyChangePasswordOtp: async (
    userId: string,
    dto: VerifyChangePasswordOtpDto,
  ): Promise<{ message: string }> => {
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

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const ok = await otpService.verifyChangePasswordOtp(user.email, otp);
    if (!ok) {
      throw new Error("OTP_INVALID_OR_EXPIRED");
    }

    const saltRounds = process.env.BCRYPT_SALT_ROUNDS
      ? Number(process.env.BCRYPT_SALT_ROUNDS)
      : 10;
    const hashed = await bcrypt.hash(newPassword, saltRounds);
    await userRepository.updatePassword(userId, hashed);

    await otpService.deleteChangePasswordOtp(user.email);

    const redis = getRedis();
    const prefix = `refresh:${userId}:`;
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

    return { message: "Đổi mật khẩu thành công" };
  },
};
