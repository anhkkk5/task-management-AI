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
    if (message.includes("Missing env SMTP")) {
      res.status(500).json({ message: "Thiếu cấu hình SMTP" });
      return;
    }
    if (message === "Missing env EMAIL_FROM") {
      res.status(500).json({ message: "Thiếu cấu hình EMAIL_FROM" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const logout = async (_req: Request, res: Response): Promise<void> => {
  try {
    const cookieToken = String((_req as any).cookies?.refreshToken ?? "");
    const bodyToken = String(_req.body?.refreshToken ?? "");
    const token = cookieToken || bodyToken;

    await authService.logout({ refreshToken: token });

    res.clearCookie("refreshToken", {
      path: "/auth",
    });

    res.status(200).json({ message: "Đăng xuất thành công" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "INVALID_INPUT") {
      res.status(400).json({ message: "Thiếu refresh token" });
      return;
    }
    if (message === "REFRESH_TOKEN_INVALID") {
      res.status(401).json({ message: "Refresh token không hợp lệ" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const logoutAll = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    await authService.logoutAll(userId);

    res.clearCookie("refreshToken", {
      path: "/auth",
    });

    res.status(200).json({ message: "Đăng xuất tất cả thiết bị thành công" });
  } catch (_err) {
    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const sendOtp = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await authService.sendOtp({
      email: String(_req.body?.email ?? ""),
    });

    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "INVALID_EMAIL") {
      res.status(400).json({ message: "Email không hợp lệ" });
      return;
    }
    if (message === "INVALID_INPUT") {
      res.status(400).json({ message: "Thiếu email" });
      return;
    }
    if (message === "PENDING_NOT_FOUND") {
      res.status(404).json({ message: "Không có đăng ký đang chờ xác thực" });
      return;
    }
    if (message.includes("Missing env SMTP")) {
      res.status(500).json({ message: "Thiếu cấu hình SMTP" });
      return;
    }
    if (message === "Missing env EMAIL_FROM") {
      res.status(500).json({ message: "Thiếu cấu hình EMAIL_FROM" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const resendOtp = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  return sendOtp(_req, res);
};

export const verifyOtp = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await authService.verifyOtp({
      email: String(_req.body?.email ?? ""),
      otp: String(_req.body?.otp ?? ""),
    });

    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "INVALID_EMAIL") {
      res.status(400).json({ message: "Email không hợp lệ" });
      return;
    }
    if (message === "INVALID_OTP") {
      res.status(400).json({ message: "OTP không hợp lệ" });
      return;
    }
    if (message === "INVALID_INPUT") {
      res.status(400).json({ message: "Thiếu email hoặc otp" });
      return;
    }
    if (message === "PENDING_NOT_FOUND") {
      res.status(404).json({ message: "Không có đăng ký đang chờ xác thực" });
      return;
    }
    if (message === "OTP_INVALID_OR_EXPIRED") {
      res.status(400).json({ message: "OTP sai hoặc đã hết hạn" });
      return;
    }
    if (message === "EMAIL_EXISTS") {
      res.status(409).json({ message: "Email đã tồn tại" });
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
      ip: String(
        (Array.isArray(_req.headers["x-forwarded-for"])
          ? _req.headers["x-forwarded-for"][0]
          : _req.headers["x-forwarded-for"]) ??
          _req.ip ??
          "",
      ),
    });

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/auth",
      maxAge: authService.getRefreshCookieMaxAgeMs(),
    });

    res
      .status(200)
      .json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "INVALID_CREDENTIALS") {
      res.status(401).json({ message: "Sai email hoặc mật khẩu" });
      return;
    }
    if (message === "TOO_MANY_ATTEMPTS") {
      res
        .status(429)
        .json({ message: "Bạn đã thử quá nhiều lần, vui lòng thử lại sau" });
      return;
    }
    if (message === "EMAIL_NOT_VERIFIED") {
      res.status(403).json({ message: "Email chưa được xác thực OTP" });
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
    if (message === "Missing env JWT_REFRESH_SECRET") {
      res.status(500).json({ message: "Thiếu cấu hình JWT_REFRESH_SECRET" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const refreshToken = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const cookieToken = String((_req as any).cookies?.refreshToken ?? "");
    const bodyToken = String(_req.body?.refreshToken ?? "");
    const token = cookieToken || bodyToken;

    const result = await authService.refreshToken({ refreshToken: token });

    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/auth",
      maxAge: authService.getRefreshCookieMaxAgeMs(),
    });

    res.status(200).json({ accessToken: result.accessToken });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "INVALID_INPUT") {
      res.status(400).json({ message: "Thiếu refresh token" });
      return;
    }
    if (message === "REFRESH_TOKEN_INVALID") {
      res.status(401).json({ message: "Refresh token không hợp lệ" });
      return;
    }
    if (message === "REFRESH_TOKEN_REVOKED") {
      res.status(401).json({ message: "Refresh token đã bị thu hồi" });
      return;
    }
    if (message === "USER_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy người dùng" });
      return;
    }
    if (message === "Missing env JWT_ACCESS_SECRET") {
      res.status(500).json({ message: "Thiếu cấu hình JWT_ACCESS_SECRET" });
      return;
    }
    if (message === "Missing env JWT_REFRESH_SECRET") {
      res.status(500).json({ message: "Thiếu cấu hình JWT_REFRESH_SECRET" });
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
