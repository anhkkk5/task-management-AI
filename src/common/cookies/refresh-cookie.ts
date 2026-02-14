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
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: input.nodeEnv === "production",
    sameSite: "strict",
    path: "/auth",
    maxAge: input.maxAgeMs,
  });
};

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie("refreshToken", {
    path: "/auth",
  });
};
