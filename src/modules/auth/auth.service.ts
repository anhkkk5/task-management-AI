import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authRepository } from "./auth.repository";
import { RegisterDto } from "./auth.dto";
import { UserRole } from "./auth.model";

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
  accessToken: string;
  user: PublicUser;
};

const signAccessToken = (payload: {
  userId: string;
  email: string;
  role: UserRole;
}): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing env JWT_SECRET");
  }

  return jwt.sign(payload, secret, { expiresIn: "1h" });
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

    const hashed = await bcrypt.hash(password, 10);
    const user = await authRepository.createUser({
      email,
      password: hashed,
      name,
      role: "user",
    });

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
};
