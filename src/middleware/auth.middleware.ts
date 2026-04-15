import { NextFunction, Request, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";

type AuthPayload = {
  userId: string;
  email: string;
  role: string;
  googleAccessToken?: string;
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
  next: NextFunction,
): void => {
  try {
    // Prioritize httpOnly cookie over header (for fresh Google auth)
    let token: string | undefined;
    let tokenSource = "none";

    // ✅ DEBUG: Log all auth sources
    console.log("[AuthMiddleware] DEBUG:", {
      method: req.method,
      path: req.path,
      cookies: Object.keys(req.cookies || {}),
      authorization: req.headers.authorization ? "present" : "missing",
      authValue: req.headers.authorization?.substring(0, 50),
    });

    if (req.cookies?.token) {
      token = req.cookies.token;
      tokenSource = "cookie";
      console.log("[AuthMiddleware] Token from cookie");
    } else if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.slice("Bearer ".length).trim();
      tokenSource = "header";
      console.log("[AuthMiddleware] Token from header");
    }

    if (!token) {
      console.log(
        "[AuthMiddleware] No token found. Cookies:",
        Object.keys(req.cookies || {}),
        "Authorization:",
        req.headers.authorization ? "present" : "missing",
      );
      res.status(401).json({ message: "Thiếu token" });
      return;
    }

    console.log("[AuthMiddleware] Token found from:", tokenSource);

    const decoded = jwt.verify(token, getSecret()) as JwtPayload | AuthPayload;
    const payload = decoded as AuthPayload;

    if (!payload.userId || !payload.email || !payload.role) {
      console.log(
        "[AuthMiddleware] Invalid payload from",
        tokenSource,
        "- fields:",
        {
          userId: !!payload.userId,
          email: !!payload.email,
          role: !!payload.role,
        },
      );
      res.status(401).json({ message: "Token không hợp lệ" });
      return;
    }

    req.user = {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      googleAccessToken: payload.googleAccessToken,
    };

    console.log("[AuthMiddleware] User set:", {
      userId: payload.userId,
      email: payload.email,
      hasGoogleAccessToken: !!payload.googleAccessToken,
      googleAccessTokenLength: payload.googleAccessToken?.length,
    });

    next();
  } catch (err: any) {
    console.log("[AuthMiddleware] Token verify error:", err.message);
    // Clear expired/invalid token cookie
    if (err.message === "jwt expired" || err.message === "invalid token") {
      res.clearCookie("token", { path: "/" });
    }
    res.status(401).json({ message: "Token không hợp lệ" });
  }
};
