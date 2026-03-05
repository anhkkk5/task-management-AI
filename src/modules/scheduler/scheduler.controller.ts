import { Request, Response } from "express";
import { intervalScheduler, slotFinder, productivityScorer } from "./index";
import { TimeInterval, TaskProfile } from "./types";

/**
 * API Controller cho Scheduler Module
 * Cung cấp endpoints để test và sử dụng các thuật toán
 */

export class SchedulerController {
  /**
   * POST /api/scheduler/check-conflict
   * Kiểm tra task mới có conflict không
   */
  async checkConflict(req: Request, res: Response) {
    try {
      const { newTask, existingTasks } = req.body;

      // Parse dates
      const parsedNewTask: TimeInterval = {
        start: new Date(newTask.start),
        end: new Date(newTask.end),
        taskId: newTask.taskId,
      };

      const parsedExisting: TimeInterval[] = existingTasks.map((t: any) => ({
        start: new Date(t.start),
        end: new Date(t.end),
        taskId: t.taskId,
      }));

      const result = intervalScheduler.checkConflict(
        parsedNewTask,
        parsedExisting,
      );

      res.json({
        success: true,
        data: {
          hasConflict: result.hasConflict,
          conflictingTasks: result.conflictingTasks,
          suggestedNewSlot: result.suggestedNewSlot
            ? {
                start: result.suggestedNewSlot.start.toISOString(),
                end: result.suggestedNewSlot.end.toISOString(),
              }
            : null,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  /**
   * POST /api/scheduler/find-free-slots
   * Tìm tất cả slots rảnh trong ngày
   */
  async findFreeSlots(req: Request, res: Response) {
    try {
      const { busySlots, date, minDuration, workHours } = req.body;

      const parsedBusy = busySlots.map((s: any) => ({
        start: new Date(s.start),
        end: new Date(s.end),
      }));

      const slots = slotFinder.findFreeSlots({
        busySlots: parsedBusy,
        date: new Date(date),
        minDuration: minDuration || 60,
        workHours: workHours || { start: 8, end: 18 },
      });

      res.json({
        success: true,
        data: slots.map((s) => ({
          start: s.start.toISOString(),
          end: s.end.toISOString(),
          duration: s.duration,
          productivityScore: s.productivityScore,
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  /**
   * POST /api/scheduler/calculate-productivity
   * Tính điểm productivity cho user
   */
  async calculateProductivity(req: Request, res: Response) {
    try {
      const { completedTasks } = req.body;

      // Input: [{ hour: 9, completed: true, duration: 60 }, ...]
      const scores = productivityScorer.calculateHourlyScores(completedTasks);

      const result = Array.from(scores.entries()).map(
        ([hourKey, scoreData]) => ({
          hour: hourKey,
          score: scoreData.score,
          confidence: scoreData.confidence,
          sampleSize: scoreData.sampleSize,
        }),
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  /**
   * POST /api/scheduler/find-optimal-slot
   * Tìm slot tối ưu cho task
   */
  async findOptimalSlot(req: Request, res: Response) {
    try {
      const { taskDuration, busySlots, date, preferredTimeOfDay, workHours } =
        req.body;

      const parsedBusy = busySlots.map((s: any) => ({
        start: new Date(s.start),
        end: new Date(s.end),
      }));

      const slot = slotFinder.findOptimalSlot({
        taskDuration: taskDuration || 60,
        preferredTimeOfDay,
        busySlots: parsedBusy,
        date: new Date(date),
        workHours: workHours || { start: 8, end: 18 },
      });

      if (!slot) {
        return res.json({
          success: true,
          data: null,
          message: "Không tìm thấy slot phù hợp",
        });
      }

      res.json({
        success: true,
        data: {
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          duration: slot.duration,
          productivityScore: slot.productivityScore,
        },
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  /**
   * POST /api/scheduler/schedule-tasks
   * Schedule nhiều tasks theo thuật toán
   */
  async scheduleTasks(req: Request, res: Response) {
    try {
      const { tasks, busySlots, startDate, endDate } = req.body;

      const parsedTasks: TimeInterval[] = tasks.map((t: any) => ({
        start: new Date(t.start),
        end: new Date(t.end),
        taskId: t.taskId,
        priority: t.priority,
      }));

      const parsedBusy = busySlots.map((s: any) => ({
        start: new Date(s.start),
        end: new Date(s.end),
      }));

      const scheduled = intervalScheduler.scheduleTasks(
        parsedTasks,
        parsedBusy,
        new Date(startDate),
        new Date(endDate),
      );

      res.json({
        success: true,
        data: scheduled.map((s) => ({
          start: s.start.toISOString(),
          end: s.end.toISOString(),
          taskId: s.taskId,
        })),
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }

  /**
   * POST /api/scheduler/find-optimal-hours
   * Tìm giờ tốt nhất cho task profile
   */
  async findOptimalHours(req: Request, res: Response) {
    try {
      const { completedTasks, taskProfile, topN } = req.body;

      const productivityScores =
        productivityScorer.calculateHourlyScores(completedTasks);

      const optimalHours = productivityScorer.findOptimalHours(
        productivityScores,
        taskProfile as TaskProfile,
        topN || 3,
      );

      res.json({
        success: true,
        data: optimalHours,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: (error as Error).message });
    }
  }
}

export const schedulerController = new SchedulerController();
