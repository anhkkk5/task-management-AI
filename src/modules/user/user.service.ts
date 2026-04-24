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

export type NotificationSettings = {
  reminderMinutes: number;
  quietHours?: {
    enabled: boolean;
    start: string; // "HH:mm"
    end: string; // "HH:mm"
  };
  groupingEnabled?: boolean;
  digest?: {
    enabled: boolean;
    frequency: "daily" | "weekly";
    time: string; // "HH:mm"
    includeTypes?: string[];
    lastSentAt?: string;
  };
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

const userProfileCacheKey = (userId: string): string =>
  `user:profile:${userId}`;

const getProfileCacheTtlSeconds = (): number => {
  const min = 600;
  const max = 1800;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const parseCachedPublicUser = (raw: string): PublicUser => {
  const obj = JSON.parse(raw) as Omit<
    PublicUser,
    "dob" | "createdAt" | "updatedAt"
  > & {
    dob?: string;
    createdAt: string;
    updatedAt: string;
  };

  return {
    ...obj,
    dob: obj.dob ? new Date(obj.dob) : undefined,
    createdAt: new Date(obj.createdAt),
    updatedAt: new Date(obj.updatedAt),
  };
};

const invalidateUserProfileCache = async (userId: string): Promise<void> => {
  try {
    const redis = getRedis();
    await redis.del(userProfileCacheKey(userId));
  } catch (_err) {
    return;
  }
};

export const userService = {
  me: async (userId: string): Promise<PublicUser> => {
    try {
      const redis = getRedis();
      const cached = await redis.get(userProfileCacheKey(userId));
      if (cached) {
        return parseCachedPublicUser(cached);
      }
    } catch (_err) {
      // ignore cache errors
    }

    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const pub = toPublicUser(user);
    try {
      const redis = getRedis();
      await redis.set(
        userProfileCacheKey(userId),
        JSON.stringify(pub),
        "EX",
        getProfileCacheTtlSeconds(),
      );
    } catch (_err) {
      // ignore cache errors
    }

    return pub;
  },

  getNotificationSettings: async (
    userId: string,
  ): Promise<NotificationSettings> => {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const notif = ((user.settings as any)?.notifications || {}) as Record<
      string,
      unknown
    >;

    const raw = notif.reminderMinutes;
    const n = typeof raw === "number" ? raw : Number(raw);
    const reminderMinutesRaw = Number.isFinite(n) ? Math.floor(n) : 5;
    const reminderMinutes =
      reminderMinutesRaw < 0
        ? 0
        : reminderMinutesRaw > 24 * 60
          ? 24 * 60
          : reminderMinutesRaw;

    const qh = (notif.quietHours as any) || {};
    const quietHours = {
      enabled: Boolean(qh.enabled),
      start: typeof qh.start === "string" ? qh.start : "22:00",
      end: typeof qh.end === "string" ? qh.end : "07:00",
    };

    const groupingEnabled = notif.groupingEnabled !== false; // default true

    const digestRaw = (notif.digest as any) || {};
    const digestFrequency: "daily" | "weekly" =
      digestRaw.frequency === "weekly" ? "weekly" : "daily";
    const digest = {
      enabled: Boolean(digestRaw.enabled),
      frequency: digestFrequency,
      time:
        typeof digestRaw.time === "string" &&
        /^\d{1,2}:\d{2}$/.test(digestRaw.time)
          ? digestRaw.time
          : "08:00",
      includeTypes: Array.isArray(digestRaw.includeTypes)
        ? digestRaw.includeTypes.map((x: any) => String(x))
        : undefined,
      lastSentAt:
        typeof digestRaw.lastSentAt === "string"
          ? digestRaw.lastSentAt
          : undefined,
    };

    return {
      reminderMinutes,
      quietHours,
      groupingEnabled,
      digest,
    };
  },

  updateNotificationSettings: async (
    userId: string,
    dto: {
      reminderMinutes?: unknown;
      quietHours?: unknown;
      groupingEnabled?: unknown;
      digest?: unknown;
    },
  ): Promise<NotificationSettings> => {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const existingSettings = (user.settings || {}) as Record<string, unknown>;
    const existingNotifications =
      ((existingSettings as any).notifications as Record<string, unknown>) ||
      {};

    // Build next notification settings (only merge provided fields)
    const nextNotif: Record<string, unknown> = { ...existingNotifications };

    if (dto.reminderMinutes !== undefined) {
      const raw = dto.reminderMinutes;
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        throw new Error("INVALID_REMINDER_MINUTES");
      }
      nextNotif.reminderMinutes = Math.min(24 * 60, Math.max(0, Math.floor(n)));
    }

    if (dto.quietHours !== undefined) {
      const q = dto.quietHours as any;
      if (
        !q ||
        typeof q !== "object" ||
        typeof q.start !== "string" ||
        typeof q.end !== "string" ||
        !/^\d{1,2}:\d{2}$/.test(q.start) ||
        !/^\d{1,2}:\d{2}$/.test(q.end)
      ) {
        throw new Error("INVALID_QUIET_HOURS");
      }
      nextNotif.quietHours = {
        enabled: Boolean(q.enabled),
        start: q.start,
        end: q.end,
      };
    }

    if (dto.groupingEnabled !== undefined) {
      nextNotif.groupingEnabled = Boolean(dto.groupingEnabled);
    }

    if (dto.digest !== undefined) {
      const d = dto.digest as any;
      if (!d || typeof d !== "object") {
        throw new Error("INVALID_DIGEST_SETTINGS");
      }

      const enabled = Boolean(d.enabled);
      const frequency = d.frequency === "weekly" ? "weekly" : "daily";
      const time = typeof d.time === "string" ? d.time : "08:00";

      if (!/^\d{1,2}:\d{2}$/.test(time)) {
        throw new Error("INVALID_DIGEST_SETTINGS");
      }

      let includeTypes: string[] | undefined;
      if (d.includeTypes !== undefined) {
        if (!Array.isArray(d.includeTypes)) {
          throw new Error("INVALID_DIGEST_SETTINGS");
        }
        includeTypes = d.includeTypes.map((x: any) => String(x));
      }

      nextNotif.digest = {
        ...(typeof (nextNotif as any).digest === "object"
          ? ((nextNotif as any).digest as Record<string, unknown>)
          : {}),
        enabled,
        frequency,
        time,
        ...(includeTypes ? { includeTypes } : {}),
      };
    }

    const nextSettings = {
      ...existingSettings,
      notifications: nextNotif,
    };

    const updated = await userRepository.updateProfile(userId, {
      settings: nextSettings,
    });
    if (!updated) {
      throw new Error("USER_NOT_FOUND");
    }

    await invalidateUserProfileCache(userId);

    // Return merged settings
    return userService.getNotificationSettings(userId);
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

    await invalidateUserProfileCache(userId);
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

    await invalidateUserProfileCache(userId);
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

    await invalidateUserProfileCache(userId);

    return { message: "Đổi mật khẩu thành công" };
  },
};
