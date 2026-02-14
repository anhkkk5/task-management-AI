import { Types } from "mongoose";
import { User, UserDoc } from "../auth/auth.model";

export const userRepository = {
  findById: async (
    userId: string | Types.ObjectId,
  ): Promise<UserDoc | null> => {
    return User.findById(userId).exec();
  },

  findByIdWithPassword: async (
    userId: string | Types.ObjectId,
  ): Promise<(UserDoc & { password: string }) | null> => {
    return User.findById(userId).select("+password").exec() as Promise<
      (UserDoc & { password: string }) | null
    >;
  },

  updateProfile: async (
    userId: string | Types.ObjectId,
    update: {
      name?: string;
      bio?: string;
      phone?: string;
      dob?: Date;
      address?: string;
      settings?: Record<string, unknown>;
    },
  ): Promise<UserDoc | null> => {
    return User.findByIdAndUpdate(
      userId,
      {
        $set: {
          ...(update.name !== undefined ? { name: update.name } : {}),
          ...(update.bio !== undefined ? { bio: update.bio } : {}),
          ...(update.phone !== undefined ? { phone: update.phone } : {}),
          ...(update.dob !== undefined ? { dob: update.dob } : {}),
          ...(update.address !== undefined ? { address: update.address } : {}),
          ...(update.settings !== undefined
            ? { settings: update.settings }
            : {}),
        },
      },
      { new: true },
    ).exec();
  },

  updateAvatar: async (
    userId: string | Types.ObjectId,
    avatar: string,
  ): Promise<UserDoc | null> => {
    return User.findByIdAndUpdate(
      userId,
      {
        $set: {
          avatar,
        },
      },
      { new: true },
    ).exec();
  },

  updatePassword: async (
    userId: string | Types.ObjectId,
    passwordHash: string,
  ): Promise<UserDoc | null> => {
    return User.findByIdAndUpdate(
      userId,
      {
        $set: {
          password: passwordHash,
        },
      },
      { new: true },
    ).exec();
  },
};
