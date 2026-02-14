import { Response } from "express";

type ErrorMap = Record<string, { status: number; message: string }>;

export const handleAuthError = (
  err: unknown,
  res: Response,
  map: ErrorMap,
): void => {
  const key = err instanceof Error ? err.message : "UNKNOWN";

  if (key.includes("Missing env SMTP")) {
    res.status(500).json({ message: "Thiếu cấu hình SMTP" });
    return;
  }

  const matched = map[key];
  if (matched) {
    res.status(matched.status).json({ message: matched.message });
    return;
  }

  res.status(500).json({ message: "Lỗi hệ thống" });
};
