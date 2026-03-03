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
