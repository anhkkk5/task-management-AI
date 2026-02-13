import bcrypt from "bcryptjs";
import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { authRepository } from "./auth.repository";
import { LoginDto, RegisterDto } from "./auth.dto";
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
};
