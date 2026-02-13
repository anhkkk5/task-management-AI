import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

type AuthPayload = {
  userId: string;
  email: string;
  role: string;
};

const getSecret = (): string => {
  const secret = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing env JWT_ACCESS_SECRET");
  }
  return secret;
};

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Thiếu token" });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const decoded = jwt.verify(token, getSecret()) as JwtPayload | AuthPayload;

    const payload = decoded as AuthPayload;
    if (!payload.userId || !payload.email || !payload.role) {
      res.status(401).json({ message: "Token không hợp lệ" });
      return;
    }

    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (_err) {
    res.status(401).json({ message: "Token không hợp lệ" });
  }
};
