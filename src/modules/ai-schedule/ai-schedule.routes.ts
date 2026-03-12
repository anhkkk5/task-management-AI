import { Router } from "express";
import { aiScheduleController } from "./ai-schedule.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

// Get all user schedules
router.get(
  "/",
  authMiddleware,
  aiScheduleController.getUserSchedules.bind(aiScheduleController),
);

// Get active schedule
router.get(
  "/active",
  authMiddleware,
  aiScheduleController.getActiveSchedule.bind(aiScheduleController),
);

// Get schedule by ID
router.get(
  "/:scheduleId",
  authMiddleware,
  aiScheduleController.getScheduleById.bind(aiScheduleController),
);

// Create new schedule
router.post(
  "/",
  authMiddleware,
  aiScheduleController.createSchedule.bind(aiScheduleController),
);

// Update session status within a schedule
router.patch(
  "/:scheduleId/sessions/status",
  authMiddleware,
  aiScheduleController.updateSessionStatus.bind(aiScheduleController),
);

// Update session time (drag-drop)
router.patch(
  "/:scheduleId/sessions/time",
  authMiddleware,
  aiScheduleController.updateSessionTime.bind(aiScheduleController),
);

// Delete one session from a schedule
router.delete(
  "/:scheduleId/sessions/:sessionId",
  authMiddleware,
  aiScheduleController.deleteSession.bind(aiScheduleController),
);

// Delete schedule
router.delete(
  "/:scheduleId",
  authMiddleware,
  aiScheduleController.deleteSchedule.bind(aiScheduleController),
);

export default router;
