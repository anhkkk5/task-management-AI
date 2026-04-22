import { Request, Response } from "express";
import { freeTimeService } from "./free-time.service";

const getUserId = (req: Request): string | null => {
  const userId = (req as any).user?.userId;
  return userId ? String(userId) : null;
};

export const getMyAvailability = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const data = await freeTimeService.getMyAvailability(userId);
    res.status(200).json({ availability: data });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Lỗi hệ thống" });
  }
};

export const updateWeeklyPattern = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const weeklyPattern = (req as any).body?.weeklyPattern;
    const timezone = (req as any).body?.timezone
      ? String((req as any).body.timezone)
      : undefined;

    const data = await freeTimeService.updateWeeklyPattern(
      userId,
      weeklyPattern,
      timezone,
    );

    res.status(200).json({ availability: data, message: "Đã cập nhật lịch rảnh" });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "INVALID_ID") {
      res.status(400).json({ message: "User ID không hợp lệ" });
      return;
    }
    if (
      message === "INVALID_TIMEZONE" ||
      message === "INVALID_TIME_FORMAT" ||
      message === "INVALID_TIME_RANGE" ||
      message === "SLOTS_OVERLAP"
    ) {
      res.status(400).json({ message: "Dữ liệu lịch rảnh không hợp lệ" });
      return;
    }
    res.status(500).json({ message: err?.message || "Lỗi hệ thống" });
  }
};

export const setCustomDate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const date = String((req as any).params?.date || "").trim();
    const slots = (req as any).body?.slots;

    const data = await freeTimeService.setCustomDate(userId, date, slots);
    res.status(200).json({ availability: data, message: "Đã lưu lịch rảnh theo ngày" });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (
      message === "INVALID_ID" ||
      message === "INVALID_DATE" ||
      message === "INVALID_TIME_FORMAT" ||
      message === "INVALID_TIME_RANGE" ||
      message === "SLOTS_OVERLAP"
    ) {
      res.status(400).json({ message: "Dữ liệu không hợp lệ" });
      return;
    }
    res.status(500).json({ message: err?.message || "Lỗi hệ thống" });
  }
};

export const deleteCustomDate = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Chưa đăng nhập" });
      return;
    }

    const date = String((req as any).params?.date || "").trim();
    const data = await freeTimeService.deleteCustomDate(userId, date);
    res.status(200).json({ availability: data, message: "Đã xóa lịch ngày tùy chỉnh" });
  } catch (err: any) {
    const message = String(err?.message || "");
    if (message === "INVALID_ID") {
      res.status(400).json({ message: "ID không hợp lệ" });
      return;
    }
    if (message === "NOT_FOUND") {
      res.status(404).json({ message: "Không tìm thấy dữ liệu" });
      return;
    }
    res.status(500).json({ message: err?.message || "Lỗi hệ thống" });
  }
};
