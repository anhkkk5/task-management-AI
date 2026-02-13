import { Types } from "mongoose";
import { User, UserAttrs, UserDoc } from "./auth.model";

export const authRepository = {
  findByEmail: async (email: string): Promise<UserDoc | null> => {
    return User.findOne({ email }).exec();
  },

  findById: async (
    userId: string | Types.ObjectId,
  ): Promise<UserDoc | null> => {
    return User.findById(userId).exec();
  },

  createUser: async (attrs: UserAttrs): Promise<UserDoc> => {
    const doc = await User.create({
      email: attrs.email,
      password: attrs.password,
      name: attrs.name,
      role: attrs.role ?? "user",
      avatar: attrs.avatar,
      isVerified: attrs.isVerified ?? false,
    });

    return doc;
  },

  updateProfile: async (
    userId: string | Types.ObjectId,
    update: { name?: string; avatar?: string },
  ): Promise<UserDoc | null> => {
    return User.findByIdAndUpdate(
      userId,
      {
        $set: {
          ...(update.name !== undefined ? { name: update.name } : {}),
          ...(update.avatar !== undefined ? { avatar: update.avatar } : {}),
        },
      },
      { new: true },
    ).exec();
  },
};
