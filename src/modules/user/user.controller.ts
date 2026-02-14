import { Request, Response } from "express";
import { userService } from "./user.service";

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
  res.status(501).json({ message: "Not implemented" });
};

export const changePassword = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};

export const getById = async (_req: Request, res: Response): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};
