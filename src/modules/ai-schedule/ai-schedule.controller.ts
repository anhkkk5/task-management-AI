import { Request, Response } from "express";
import { aiScheduleService } from "./ai-schedule.service";
import {
  CreateScheduleInput,
  UpdateSessionStatusInput,
} from "./ai-schedule.dto";

export class AIScheduleController {
  async getUserSchedules(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const schedules = await aiScheduleService.getUserSchedules(userId);
      res.json({ success: true, data: schedules });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get schedules",
      });
    }
  }

  async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const scheduleId = req.params.scheduleId as string;
      const sessionId = req.params.sessionId as string;

      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      if (!sessionId) {
        res.status(400).json({ message: "sessionId is required" });
        return;
      }

      const updated = await aiScheduleService.deleteSession(
        scheduleId,
        userId,
        sessionId,
      );

      if (!updated) {
        res.status(404).json({ message: "Schedule or session not found" });
        return;
      }

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to delete session",
      });
    }
  }

  async getActiveSchedule(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const schedule = await aiScheduleService.getActiveSchedule(userId);
      res.json({ success: true, data: schedule });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get active schedule",
      });
    }
  }

  async getScheduleById(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const scheduleId = req.params.scheduleId as string;

      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const schedule = await aiScheduleService.getScheduleById(
        scheduleId,
        userId,
      );

      if (!schedule) {
        res.status(404).json({ message: "Schedule not found" });
        return;
      }

      res.json({ success: true, data: schedule });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get schedule",
      });
    }
  }

  async createSchedule(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const input: CreateScheduleInput = req.body;
      const schedule = await aiScheduleService.createSchedule(userId, input);
      res.json({ success: true, data: schedule });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to create schedule",
      });
    }
  }

  async updateSessionStatus(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const scheduleId = req.params.scheduleId as string;

      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const input: UpdateSessionStatusInput = req.body;
      const updated = await aiScheduleService.updateSessionStatus(
        scheduleId,
        userId,
        input,
      );

      if (!updated) {
        res.status(404).json({ message: "Schedule or session not found" });
        return;
      }

      res.json({ success: true, data: updated });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update session status",
      });
    }
  }

  async updateSessionTime(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const scheduleId = req.params.scheduleId as string;
      const { sessionId, suggestedTime, targetDate } = req.body;

      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      if (!sessionId || !suggestedTime) {
        res
          .status(400)
          .json({ message: "sessionId and suggestedTime are required" });
        return;
      }

      const updated = await aiScheduleService.updateSessionTime(
        scheduleId,
        userId,
        sessionId,
        suggestedTime,
        targetDate,
      );

      if (!updated) {
        res.status(404).json({ message: "Schedule or session not found" });
        return;
      }

      res.json({ success: true, data: updated });
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message === "SESSION_ALREADY_STARTED") {
        res.status(409).json({
          success: false,
          message:
            "Không thể di chuyển: phiên làm việc đã bắt đầu hoặc đã qua.",
        });
        return;
      }
      if (message === "TARGET_TIME_IN_PAST") {
        res.status(400).json({
          success: false,
          message: "Không thể di chuyển về thời gian trong quá khứ.",
        });
        return;
      }
      if (
        message === "INVALID_SUGGESTED_TIME" ||
        message === "INVALID_TARGET_DATE"
      ) {
        res.status(400).json({
          success: false,
          message: "Thời gian hoặc ngày di chuyển không hợp lệ.",
        });
        return;
      }
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update session time",
      });
    }
  }

  async deleteSchedule(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const scheduleId = req.params.scheduleId as string;

      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const deleted = await aiScheduleService.deleteSchedule(
        scheduleId,
        userId,
      );

      if (!deleted) {
        res.status(404).json({ message: "Schedule not found" });
        return;
      }

      res.json({ success: true, message: "Schedule deleted" });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Failed to delete schedule",
      });
    }
  }
}

export const aiScheduleController = new AIScheduleController();
