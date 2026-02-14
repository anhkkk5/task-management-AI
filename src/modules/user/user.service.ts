import { UserRole } from "../auth/auth.model";
import { userRepository } from "./user.repository";
import { UpdateUserProfileDto } from "./user.dto";

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
};
