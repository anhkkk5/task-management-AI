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
  res.status(501).json({ message: "Not implemented" });
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
