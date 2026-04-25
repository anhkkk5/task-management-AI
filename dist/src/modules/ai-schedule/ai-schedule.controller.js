"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiScheduleController = exports.AIScheduleController = void 0;
const ai_schedule_service_1 = require("./ai-schedule.service");
class AIScheduleController {
    async getUserSchedules(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const schedules = await ai_schedule_service_1.aiScheduleService.getUserSchedules(userId);
            res.json({ success: true, data: schedules });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || "Failed to get schedules",
            });
        }
    }
    async deleteSession(req, res) {
        try {
            const userId = req.user?.userId;
            const scheduleId = req.params.scheduleId;
            const sessionId = req.params.sessionId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            if (!sessionId) {
                res.status(400).json({ message: "sessionId is required" });
                return;
            }
            const updated = await ai_schedule_service_1.aiScheduleService.deleteSession(scheduleId, userId, sessionId);
            if (!updated) {
                res.status(404).json({ message: "Schedule or session not found" });
                return;
            }
            res.json({ success: true, data: updated });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || "Failed to delete session",
            });
        }
    }
    async getActiveSchedule(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const schedule = await ai_schedule_service_1.aiScheduleService.getActiveSchedule(userId);
            res.json({ success: true, data: schedule });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || "Failed to get active schedule",
            });
        }
    }
    async getScheduleById(req, res) {
        try {
            const userId = req.user?.userId;
            const scheduleId = req.params.scheduleId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const schedule = await ai_schedule_service_1.aiScheduleService.getScheduleById(scheduleId, userId);
            if (!schedule) {
                res.status(404).json({ message: "Schedule not found" });
                return;
            }
            res.json({ success: true, data: schedule });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || "Failed to get schedule",
            });
        }
    }
    async createSchedule(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const input = req.body;
            const schedule = await ai_schedule_service_1.aiScheduleService.createSchedule(userId, input);
            res.json({ success: true, data: schedule });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || "Failed to create schedule",
            });
        }
    }
    async updateSessionStatus(req, res) {
        try {
            const userId = req.user?.userId;
            const scheduleId = req.params.scheduleId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const input = req.body;
            const updated = await ai_schedule_service_1.aiScheduleService.updateSessionStatus(scheduleId, userId, input);
            if (!updated) {
                res.status(404).json({ message: "Schedule or session not found" });
                return;
            }
            res.json({ success: true, data: updated });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || "Failed to update session status",
            });
        }
    }
    async updateSessionTime(req, res) {
        try {
            const userId = req.user?.userId;
            const scheduleId = req.params.scheduleId;
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
            const updated = await ai_schedule_service_1.aiScheduleService.updateSessionTime(scheduleId, userId, sessionId, suggestedTime, targetDate);
            if (!updated) {
                res.status(404).json({ message: "Schedule or session not found" });
                return;
            }
            res.json({ success: true, data: updated });
        }
        catch (error) {
            const message = String(error?.message || "");
            if (message === "SESSION_ALREADY_STARTED") {
                res.status(409).json({
                    success: false,
                    message: "Không thể di chuyển: phiên làm việc đã bắt đầu hoặc đã qua.",
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
            if (message === "INVALID_SUGGESTED_TIME" ||
                message === "INVALID_TARGET_DATE") {
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
    async deleteSchedule(req, res) {
        try {
            const userId = req.user?.userId;
            const scheduleId = req.params.scheduleId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const deleted = await ai_schedule_service_1.aiScheduleService.deleteSchedule(scheduleId, userId);
            if (!deleted) {
                res.status(404).json({ message: "Schedule not found" });
                return;
            }
            res.json({ success: true, message: "Schedule deleted" });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: error.message || "Failed to delete schedule",
            });
        }
    }
}
exports.AIScheduleController = AIScheduleController;
exports.aiScheduleController = new AIScheduleController();
