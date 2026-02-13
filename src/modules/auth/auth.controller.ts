import { Request, Response } from "express";
import { authService } from "./auth.service";

export const register = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await authService.register({
      email: String(_req.body?.email ?? ""),
      password: String(_req.body?.password ?? ""),
      name: String(_req.body?.name ?? ""),
    });

    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "EMAIL_EXISTS") {
      res.status(409).json({ message: "Email đã tồn tại" });
      return;
    }
    if (message === "INVALID_EMAIL") {
      res.status(400).json({ message: "Email không hợp lệ" });
      return;
    }
    if (message === "INVALID_PASSWORD") {
      res.status(400).json({ message: "Mật khẩu phải ít nhất 6 ký tự" });
      return;
    }
    if (message === "INVALID_INPUT") {
      res.status(400).json({ message: "Thiếu thông tin đăng ký" });
      return;
    }
    if (message === "Missing env JWT_SECRET") {
      res.status(500).json({ message: "Thiếu cấu hình JWT_SECRET" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const login = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await authService.login({
      email: String(_req.body?.email ?? ""),
      password: String(_req.body?.password ?? ""),
    });

    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "INVALID_CREDENTIALS") {
      res.status(401).json({ message: "Sai email hoặc mật khẩu" });
      return;
    }
    if (message === "INVALID_EMAIL") {
      res.status(400).json({ message: "Email không hợp lệ" });
      return;
    }
    if (message === "INVALID_INPUT") {
      res.status(400).json({ message: "Thiếu thông tin đăng nhập" });
      return;
    }
    if (message === "Missing env JWT_ACCESS_SECRET") {
      res.status(500).json({ message: "Thiếu cấu hình JWT_ACCESS_SECRET" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const me = async (_req: Request, res: Response): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};

export const updateProfile = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};
