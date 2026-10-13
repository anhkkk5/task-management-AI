import { Request, Response } from "express";
import { routineService } from "./routine.service";

export const getRoutines = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Chưa xác thực người dùng" });
    }
    const routines = await routineService.getRoutines(String(userId));
    return res.status(200).json({ routines });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Lỗi khi lấy danh sách lịch lặp lại" });
  }
};

export const createRoutine = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Chưa xác thực người dùng" });
    }
    const { title, description, startTime, endTime, daysOfWeek, category, color } = req.body;
    if (!title || !startTime || !endTime) {
      return res.status(400).json({ message: "Tiêu đề, giờ bắt đầu và giờ kết thúc là bắt buộc" });
    }
    const routine = await routineService.createRoutine(String(userId), {
      title,
      description,
      startTime,
      endTime,
      daysOfWeek,
      category,
      color,
    });
    return res.status(201).json({ routine, message: "Đã tạo lịch lặp lại hàng ngày thành công" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Lỗi khi tạo lịch lặp lại" });
  }
};

export const updateRoutine = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Chưa xác thực người dùng" });
    }
    const id = String(req.params.id);
    const routine = await routineService.updateRoutine(String(userId), id, req.body);
    if (!routine) {
      return res.status(404).json({ message: "Không tìm thấy lịch lặp lại" });
    }
    return res.status(200).json({ routine, message: "Đã cập nhật lịch lặp lại thành công" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Lỗi khi cập nhật lịch lặp lại" });
  }
};

export const deleteRoutine = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Chưa xác thực người dùng" });
    }
    const id = String(req.params.id);
    const success = await routineService.deleteRoutine(String(userId), id);
    if (!success) {
      return res.status(404).json({ message: "Không tìm thấy lịch lặp lại để xóa" });
    }
    return res.status(200).json({ success: true, message: "Đã xóa lịch lặp lại thành công" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Lỗi khi xóa lịch lặp lại" });
  }
};

export const seedDefaultRoutines = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?._id || (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Chưa xác thực người dùng" });
    }
    const routines = await routineService.seedDefaultRoutines(String(userId));
    return res.status(200).json({ routines, message: "Đã nạp bộ lịch lặp lại hàng ngày mẫu thành công" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || "Lỗi khi nạp lịch lặp lại mẫu" });
  }
};
