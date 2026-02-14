import { UserRole } from "../auth/auth.model";
import { userRepository } from "./user.repository";

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatar?: string;
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

export const userService = {
  me: async (userId: string): Promise<PublicUser> => {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    return toPublicUser(user);
  },
};
