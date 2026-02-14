import { Request, Response } from "express";
import { userService } from "./user.service";
import { uploadImageBuffer } from "../../services/cloudinary.service";
import { clearRefreshCookie } from "../../common/cookies/refresh-cookie";

export const me = async (_req: Request, res: Response): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const user = await userService.me(userId);
    res.status(200).json(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "USER_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy người dùng" });
      return;
    }

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

    const dobRaw =
      _req.body?.dob !== undefined ? String(_req.body.dob) : undefined;
    const dob = dobRaw ? new Date(dobRaw) : undefined;
    if (dobRaw && Number.isNaN(dob?.getTime())) {
      res.status(400).json({ message: "Ngày sinh không hợp lệ" });
      return;
    }

    const user = await userService.updateProfile(userId, {
      name: _req.body?.name !== undefined ? String(_req.body.name) : undefined,
      bio: _req.body?.bio !== undefined ? String(_req.body.bio) : undefined,
      phone:
        _req.body?.phone !== undefined ? String(_req.body.phone) : undefined,
      dob,
      address:
        _req.body?.address !== undefined
          ? String(_req.body.address)
          : undefined,
      settings:
        _req.body?.settings !== undefined
          ? (_req.body.settings as Record<string, unknown>)
          : undefined,
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

    const file = (_req as any).file as
      | { buffer: Buffer; mimetype?: string }
      | undefined;

    if (!file?.buffer) {
      res.status(400).json({ message: "Thiếu file avatar" });
      return;
    }
    if (file.mimetype && !file.mimetype.startsWith("image/")) {
      res.status(400).json({ message: "File không phải hình ảnh" });
      return;
    }

    const uploaded = await uploadImageBuffer(file.buffer, {
      folder: "task-management-ai/avatars",
      publicId: `user_${userId}_${Date.now()}`,
    });

    const user = await userService.uploadAvatar(userId, uploaded.url);
    res.status(200).json({ user });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "Missing env CLOUDINARY") {
      res.status(500).json({ message: "Thiếu cấu hình Cloudinary" });
      return;
    }
    if (message === "USER_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy người dùng" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const changePassword = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = _req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const result = await userService.changePassword(userId, {
      oldPassword: String(_req.body?.oldPassword ?? ""),
      newPassword: String(_req.body?.newPassword ?? ""),
    });

    clearRefreshCookie(res);
    res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";

    if (message === "INVALID_INPUT") {
      res.status(400).json({ message: "Thiếu mật khẩu cũ hoặc mật khẩu mới" });
      return;
    }
    if (message === "INVALID_PASSWORD") {
      res.status(400).json({ message: "Mật khẩu mới phải ít nhất 6 ký tự" });
      return;
    }
    if (message === "OLD_PASSWORD_INCORRECT") {
      res.status(401).json({ message: "Mật khẩu cũ không đúng" });
      return;
    }
    if (message === "USER_NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy người dùng" });
      return;
    }

    res.status(500).json({ message: "Lỗi hệ thống" });
  }
};

export const getById = async (_req: Request, res: Response): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};
