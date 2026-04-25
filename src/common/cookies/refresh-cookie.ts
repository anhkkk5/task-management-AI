import { Response } from "express";

type CookieOptionsInput = {
  maxAgeMs: number;
  nodeEnv?: string;
};

export const setRefreshCookie = (
  res: Response,
  refreshToken: string,
  input: CookieOptionsInput,
): void => {
  const isProduction = input.nodeEnv === "production";
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/auth",
    maxAge: input.maxAgeMs,
  });
};

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie("refreshToken", {
    path: "/auth",
  });
};
