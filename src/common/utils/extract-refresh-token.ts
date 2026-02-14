import { Request } from "express";

type CookieLikeRequest = Request & { cookies?: Record<string, unknown> };

export const extractRefreshToken = (req: Request): string => {
  const r = req as CookieLikeRequest;
  const cookieToken = String(r.cookies?.refreshToken ?? "");
  const bodyToken = String((req as any).body?.refreshToken ?? "");
  return cookieToken || bodyToken;
};
