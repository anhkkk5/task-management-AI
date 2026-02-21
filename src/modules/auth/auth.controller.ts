import { Request, Response } from "express";
import { authService } from "./auth.service";
import { authRepository } from "./auth.repository";
import { handleAuthError } from "../../common/errors/auth.error-handler";
import {
  clearRefreshCookie,
  setRefreshCookie,
} from "../../common/cookies/refresh-cookie";
import { extractRefreshToken } from "../../common/utils/extract-refresh-token";

const cookieInput = () => {
  return {
    maxAgeMs: authService.getRefreshCookieMaxAgeMs(),
    nodeEnv: process.env.NODE_ENV,
  };
};

const registerErrorMap = {
  EMAIL_EXISTS: { status: 409, message: "Email đã tồn tại" },
  INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
  INVALID_PASSWORD: { status: 400, message: "Mật khẩu phải ít nhất 6 ký tự" },
  INVALID_INPUT: { status: 400, message: "Thiếu thông tin đăng ký" },
  "Missing env EMAIL_FROM": {
    status: 500,
    message: "Thiếu cấu hình EMAIL_FROM",
  },
} as const;

const sendOtpErrorMap = {
  INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
  INVALID_INPUT: { status: 400, message: "Thiếu email" },
  PENDING_NOT_FOUND: {
    status: 404,
    message: "Không có đăng ký đang chờ xác thực",
  },
  "Missing env EMAIL_FROM": {
    status: 500,
    message: "Thiếu cấu hình EMAIL_FROM",
  },
} as const;

const verifyOtpErrorMap = {
  INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
  INVALID_OTP: { status: 400, message: "OTP không hợp lệ" },
  INVALID_INPUT: { status: 400, message: "Thiếu email hoặc otp" },
  PENDING_NOT_FOUND: {
    status: 404,
    message: "Không có đăng ký đang chờ xác thực",
  },
  OTP_INVALID_OR_EXPIRED: { status: 400, message: "OTP sai hoặc đã hết hạn" },
  EMAIL_EXISTS: { status: 409, message: "Email đã tồn tại" },
} as const;

const loginErrorMap = {
  INVALID_CREDENTIALS: { status: 401, message: "Sai email hoặc mật khẩu" },
  TOO_MANY_ATTEMPTS: {
    status: 429,
    message: "Bạn đã thử quá nhiều lần, vui lòng thử lại sau",
  },
  EMAIL_NOT_VERIFIED: { status: 403, message: "Email chưa được xác thực OTP" },
  INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
  INVALID_INPUT: { status: 400, message: "Thiếu thông tin đăng nhập" },
  "Missing env JWT_ACCESS_SECRET": {
    status: 500,
    message: "Thiếu cấu hình JWT_ACCESS_SECRET",
  },
  "Missing env JWT_REFRESH_SECRET": {
    status: 500,
    message: "Thiếu cấu hình JWT_REFRESH_SECRET",
  },
} as const;

const refreshTokenErrorMap = {
  INVALID_INPUT: { status: 400, message: "Thiếu refresh token" },
  REFRESH_TOKEN_INVALID: { status: 401, message: "Refresh token không hợp lệ" },
  REFRESH_TOKEN_REVOKED: {
    status: 401,
    message: "Refresh token đã bị thu hồi",
  },
  USER_NOT_FOUND: { status: 404, message: "Không tìm thấy người dùng" },
  "Missing env JWT_ACCESS_SECRET": {
    status: 500,
    message: "Thiếu cấu hình JWT_ACCESS_SECRET",
  },
  "Missing env JWT_REFRESH_SECRET": {
    status: 500,
    message: "Thiếu cấu hình JWT_REFRESH_SECRET",
  },
} as const;

const logoutErrorMap = {
  INVALID_INPUT: { status: 400, message: "Thiếu refresh token" },
  REFRESH_TOKEN_INVALID: { status: 401, message: "Refresh token không hợp lệ" },
} as const;

const updateProfileErrorMap = {
  INVALID_NAME: { status: 400, message: "Tên không hợp lệ" },
  USER_NOT_FOUND: { status: 404, message: "Không tìm thấy người dùng" },
} as const;

export const register = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await authService.register({
      email: String(_req.body?.email ?? ""),
      password: String(_req.body?.password ?? ""),
      name: String(_req.body?.name ?? ""),
    });

    res.status(201).json(result);
  } catch (err) {
    handleAuthError(err, res, registerErrorMap);
  }
};

export const logout = async (_req: Request, res: Response): Promise<void> => {
  try {
    const token = extractRefreshToken(_req);
    await authService.logout({ refreshToken: token });

    clearRefreshCookie(res);
    res.status(200).json({ message: "Đăng xuất thành công" });
  } catch (err) {
    handleAuthError(err, res, logoutErrorMap);
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
    handleAuthError(err, res, sendOtpErrorMap);
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
    handleAuthError(err, res, verifyOtpErrorMap);
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

    setRefreshCookie(res, result.refreshToken, cookieInput());

    res
      .status(200)
      .json({ accessToken: result.accessToken, user: result.user });
  } catch (err) {
    handleAuthError(err, res, loginErrorMap);
  }
};

export const refreshToken = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const token = extractRefreshToken(_req);
    const result = await authService.refreshToken({ refreshToken: token });

    setRefreshCookie(res, result.refreshToken, cookieInput());

    res.status(200).json({ accessToken: result.accessToken });
  } catch (err) {
    handleAuthError(err, res, refreshTokenErrorMap);
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
    handleAuthError(err, res, updateProfileErrorMap);
  }
};

const uploadAvatarErrorMap = {
  INVALID_INPUT: { status: 400, message: "Thiếu file ảnh" },
  FILE_TOO_LARGE: { status: 400, message: "Ảnh phải nhỏ hơn 5MB" },
  INVALID_FILE_TYPE: { status: 400, message: "Chỉ chấp nhận file ảnh" },
  UPLOAD_FAILED: { status: 500, message: "Tải ảnh lên thất bại" },
} as const;

export const uploadAvatar = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    if (!_req.file) {
      res.status(400).json({ message: "Thiếu file ảnh" });
      return;
    }

    const url = await authService.uploadAvatar(userId, _req.file);
    res.status(200).json({ url });
  } catch (err) {
    handleAuthError(err, res, uploadAvatarErrorMap);
  }
};

const forgotPasswordErrorMap = {
  INVALID_INPUT: { status: 400, message: "Thiếu email" },
  INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
  USER_NOT_FOUND: { status: 404, message: "Không tìm thấy người dùng" },
} as const;

const verifyForgotPasswordOtpErrorMap = {
  INVALID_INPUT: { status: 400, message: "Thiếu email hoặc OTP" },
  INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
  INVALID_OTP: { status: 400, message: "OTP phải có 6 chữ số" },
  USER_NOT_FOUND: { status: 404, message: "Không tìm thấy người dùng" },
  OTP_INVALID_OR_EXPIRED: { status: 400, message: "OTP sai hoặc đã hết hạn" },
} as const;

const resetPasswordErrorMap = {
  INVALID_INPUT: { status: 400, message: "Thiếu thông tin" },
  INVALID_EMAIL: { status: 400, message: "Email không hợp lệ" },
  INVALID_OTP: { status: 400, message: "OTP phải có 6 chữ số" },
  INVALID_PASSWORD: { status: 400, message: "Mật khẩu phải ít nhất 6 ký tự" },
  USER_NOT_FOUND: { status: 404, message: "Không tìm thấy người dùng" },
  OTP_INVALID_OR_EXPIRED: { status: 400, message: "OTP sai hoặc đã hết hạn" },
} as const;

export const forgotPassword = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await authService.forgotPassword(
      String(_req.body?.email ?? ""),
    );
    res.status(200).json(result);
  } catch (err) {
    handleAuthError(err, res, forgotPasswordErrorMap);
  }
};

export const verifyForgotPasswordOtp = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await authService.verifyForgotPasswordOtp(
      String(_req.body?.email ?? ""),
      String(_req.body?.otp ?? ""),
    );
    res.status(200).json(result);
  } catch (err) {
    handleAuthError(err, res, verifyForgotPasswordOtpErrorMap);
  }
};

export const resetPassword = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await authService.resetPassword(
      String(_req.body?.email ?? ""),
      String(_req.body?.otp ?? ""),
      String(_req.body?.newPassword ?? ""),
    );
    res.status(200).json(result);
  } catch (err) {
    handleAuthError(err, res, resetPasswordErrorMap);
  }
};
