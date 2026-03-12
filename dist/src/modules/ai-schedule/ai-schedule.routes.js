"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ai_schedule_controller_1 = require("./ai-schedule.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
// Get all user schedules
router.get("/", auth_middleware_1.authMiddleware, ai_schedule_controller_1.aiScheduleController.getUserSchedules.bind(ai_schedule_controller_1.aiScheduleController));
// Get active schedule
router.get("/active", auth_middleware_1.authMiddleware, ai_schedule_controller_1.aiScheduleController.getActiveSchedule.bind(ai_schedule_controller_1.aiScheduleController));
// Get schedule by ID
router.get("/:scheduleId", auth_middleware_1.authMiddleware, ai_schedule_controller_1.aiScheduleController.getScheduleById.bind(ai_schedule_controller_1.aiScheduleController));
// Create new schedule
router.post("/", auth_middleware_1.authMiddleware, ai_schedule_controller_1.aiScheduleController.createSchedule.bind(ai_schedule_controller_1.aiScheduleController));
// Update session status within a schedule
router.patch("/:scheduleId/sessions/status", auth_middleware_1.authMiddleware, ai_schedule_controller_1.aiScheduleController.updateSessionStatus.bind(ai_schedule_controller_1.aiScheduleController));
// Update session time (drag-drop)
router.patch("/:scheduleId/sessions/time", auth_middleware_1.authMiddleware, ai_schedule_controller_1.aiScheduleController.updateSessionTime.bind(ai_schedule_controller_1.aiScheduleController));
// Delete schedule
router.delete("/:scheduleId", auth_middleware_1.authMiddleware, ai_schedule_controller_1.aiScheduleController.deleteSchedule.bind(ai_schedule_controller_1.aiScheduleController));
exports.default = router;
