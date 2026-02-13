import { Request, Response } from "express";
import { authService } from "./auth.service";
import { authRepository } from "./auth.repository";

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
    if (message === "Missing env JWT_ACCESS_SECRET") {
      res.status(500).json({ message: "Thiếu cấu hình JWT_ACCESS_SECRET" });
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
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const user = await authRepository.findById(userId);
    if (!user) {
      res.status(404).json({ message: "Không tìm thấy người dùng" });
      return;
    }

    res.status(200).json({
      id: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (_err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const updateProfile = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const user = await authService.updateProfile(userId, {
      name: _req.body?.name !== undefined ? String(_req.body.name) : undefined,
      avatar:
        _req.body?.avatar !== undefined ? String(_req.body.avatar) : undefined,
    });

    res.status(200).json({ user });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "INVALID_NAME") {
      res.status(400).json({ message: "Tên không hợp lệ" });
      return;
    }
    if (message === "USER_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy người dùng" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};
