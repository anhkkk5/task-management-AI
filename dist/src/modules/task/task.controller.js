"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearAllScheduledTimes = exports.clearScheduledTime = exports.saveAISchedule = exports.updateTaskStatus = exports.deleteTask = exports.updateTask = exports.listOverdueTasks = exports.listTasks = exports.getTaskById = exports.createTask = exports.explainTaskEstimation = exports.aiBreakdownTask = void 0;
const task_service_1 = require("./task.service");
const ai_schedule_service_1 = require("../ai-schedule/ai-schedule.service");
const search_helper_1 = __importDefault(require("../../common/utils/search-helper"));
const pagination_helper_1 = __importDefault(require("../../common/utils/pagination-helper"));
const parsePriority = (value) => {
    if (value === undefined || value === null)
        return undefined;
    const v = String(value);
    if (v === "low" || v === "medium" || v === "high" || v === "urgent")
        return v;
    return undefined;
};
const aiBreakdownTask = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const taskId = String(_req.params.id ?? "").trim();
        if (!taskId) {
            res.status(400).json({ message: "Task id không hợp lệ" });
            return;
        }
        const task = await task_service_1.taskService.aiBreakdown(userId, taskId);
        res.status(200).json({ task });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "TASK_FORBIDDEN") {
            res.status(403).json({ message: "Không có quyền truy cập task này" });
            return;
        }
        if (message === "AI_JSON_INVALID" || message === "AI_RESPONSE_INVALID") {
            res.status(500).json({
                message: "AI trả về dữ liệu không đúng định dạng. Thử lại sau.",
                ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
            });
            return;
        }
        if (message === "GROQ_RATE_LIMIT") {
            res
                .status(429)
                .json({ message: "Groq bị giới hạn rate limit. Thử lại sau." });
            return;
        }
        if (message === "GROQ_API_KEY_MISSING") {
            res.status(500).json({ message: "Thiếu GROQ_API_KEY trong env" });
            return;
        }
        if (message === "GROQ_UNAUTHORIZED") {
            res.status(500).json({
                message: "Groq bị từ chối (API key không hợp lệ hoặc không có quyền).",
            });
            return;
        }
        if (message === "GEMINI_RATE_LIMIT") {
            res.status(429).json({
                message: "Gemini đã đạt giới hạn request trong ngày. Vui lòng thử lại sau hoặc dùng Groq.",
            });
            return;
        }
        if (message === "GEMINI_API_KEY_MISSING") {
            res.status(500).json({ message: "Thiếu GEMINI_API_KEY trong env" });
            return;
        }
        if (message === "GEMINI_UNAUTHORIZED") {
            res.status(500).json({
                message: "Gemini bị từ chối (API key không hợp lệ hoặc không có quyền).",
            });
            return;
        }
        if (message === "AI_PROVIDER_FAILED") {
            res.status(503).json({
                message: "Tất cả nhà cung cấp AI đang không khả dụng (rate limit/lỗi). Vui lòng thử lại sau.",
            });
            return;
        }
        // Catch raw Gemini/Groq SDK errors that might slip through
        const rawMsg = String(err instanceof Error ? err.message : JSON.stringify(err)).toLowerCase();
        if (rawMsg.includes("429") ||
            rawMsg.includes("resource_exhausted") ||
            rawMsg.includes("quota") ||
            rawMsg.includes("rate limit") ||
            rawMsg.includes("too many requests")) {
            console.warn("[aiBreakdownTask] Detected raw rate-limit error:", rawMsg);
            res.status(429).json({
                message: "AI đang bị giới hạn request (rate limit). Vui lòng thử lại sau.",
            });
            return;
        }
        console.error("[aiBreakdownTask] Unhandled error:", err);
        const detail = process.env.NODE_ENV !== "production" && err instanceof Error
            ? err.message
            : undefined;
        res.status(500).json({
            message: detail
                ? `Lỗi AI Breakdown: ${detail}`
                : "Lỗi hệ thống khi tạo AI Breakdown. Vui lòng thử lại.",
        });
    }
};
exports.aiBreakdownTask = aiBreakdownTask;
const explainTaskEstimation = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const taskId = String(_req.params.id ?? "").trim();
        if (!taskId) {
            res.status(400).json({ message: "Task id không hợp lệ" });
            return;
        }
        const explanation = await task_service_1.taskService.explainEstimation(userId, taskId);
        if (!explanation) {
            res
                .status(404)
                .json({ message: "Không thể giải thích ước lượng cho task" });
            return;
        }
        res.status(200).json({ explanation });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "TASK_FORBIDDEN") {
            res.status(403).json({ message: "Không có quyền truy cập task này" });
            return;
        }
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "User ID không hợp lệ" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống", error: message });
    }
};
exports.explainTaskEstimation = explainTaskEstimation;
const parseStatus = (value) => {
    if (value === undefined || value === null)
        return undefined;
    const v = String(value);
    if (v === "todo" ||
        v === "scheduled" ||
        v === "in_progress" ||
        v === "completed" ||
        v === "cancelled")
        return v;
    return undefined;
};
const parsePositiveInt = (value, defaultValue) => {
    if (value === undefined || value === null)
        return defaultValue;
    const n = Number(value);
    if (!Number.isFinite(n))
        return defaultValue;
    const x = Math.floor(n);
    if (x <= 0)
        return defaultValue;
    return x;
};
const parseType = (value) => {
    if (value === undefined || value === null)
        return undefined;
    const v = String(value);
    if (v === "event" || v === "todo" || v === "appointment")
        return v;
    return undefined;
};
const parseVisibility = (value) => {
    if (value === undefined || value === null)
        return undefined;
    const v = String(value);
    if (v === "default" || v === "public" || v === "private")
        return v;
    return undefined;
};
const parseGuests = (value) => {
    if (value === undefined || value === null)
        return undefined;
    if (!Array.isArray(value))
        return undefined;
    const emails = value
        .map((x) => String(x).trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    return emails.length > 0 ? [...new Set(emails)] : [];
};
/**
 * Parse guest details from request body
 * Validates guest information including email, name, avatar, permission, and status
 */
const parseGuestDetails = (value) => {
    if (value === undefined || value === null)
        return undefined;
    if (!Array.isArray(value))
        return undefined;
    const guestDetails = [];
    for (const item of value) {
        if (!item || typeof item !== "object")
            continue;
        const guestId = String(item.guestId || "").trim();
        const email = String(item.email || "")
            .trim()
            .toLowerCase();
        const name = String(item.name || "").trim();
        const avatar = item.avatar ? String(item.avatar).trim() : undefined;
        const permission = item.permission;
        const status = item.status;
        // Validate required fields
        if (!guestId || !email || !name)
            continue;
        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            continue;
        // Validate permission
        if (permission !== "edit_event" &&
            permission !== "view_guest_list" &&
            permission !== "invite_others") {
            continue;
        }
        // Validate status if provided
        if (status &&
            status !== "pending" &&
            status !== "accepted" &&
            status !== "declined") {
            continue;
        }
        guestDetails.push({
            guestId,
            email,
            name,
            avatar,
            permission,
            status: status || "pending",
        });
    }
    return guestDetails.length > 0 ? guestDetails : undefined;
};
const parseReminderMinutes = (value) => {
    if (value === undefined || value === null)
        return undefined;
    const n = Number(value);
    if (!Number.isFinite(n))
        return undefined;
    const x = Math.floor(n);
    if (x < 0)
        return undefined;
    return x;
};
const parseScheduledTime = (value) => {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== "object")
        return undefined;
    const obj = value;
    const startRaw = obj?.start !== undefined ? String(obj.start) : undefined;
    const endRaw = obj?.end !== undefined ? String(obj.end) : undefined;
    if (!startRaw || !endRaw)
        return undefined;
    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
        return undefined;
    if (end.getTime() <= start.getTime())
        return undefined;
    return {
        start,
        end,
        aiPlanned: obj?.aiPlanned !== undefined ? Boolean(obj.aiPlanned) : undefined,
        reason: obj?.reason !== undefined ? String(obj.reason) : undefined,
    };
};
const getTodayRange = () => {
    const now = new Date();
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);
    return { from, to };
};
const createTask = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const deadlineRaw = _req.body?.deadline !== undefined
            ? String(_req.body.deadline)
            : undefined;
        const deadline = deadlineRaw ? new Date(deadlineRaw) : undefined;
        if (deadlineRaw && Number.isNaN(deadline?.getTime())) {
            res.status(400).json({ message: "Deadline không hợp lệ" });
            return;
        }
        const startAtRaw = _req.body?.startAt !== undefined ? String(_req.body.startAt) : undefined;
        const startAt = startAtRaw ? new Date(startAtRaw) : undefined;
        if (startAtRaw && Number.isNaN(startAt?.getTime())) {
            res.status(400).json({ message: "Ngày bắt đầu không hợp lệ" });
            return;
        }
        const reminderAtRaw = _req.body?.reminderAt !== undefined
            ? String(_req.body.reminderAt)
            : undefined;
        const reminderAt = reminderAtRaw ? new Date(reminderAtRaw) : undefined;
        if (reminderAtRaw && Number.isNaN(reminderAt?.getTime())) {
            res.status(400).json({ message: "ReminderAt không hợp lệ" });
            return;
        }
        const scheduledTime = _req.body?.scheduledTime !== undefined && _req.body.scheduledTime !== null
            ? parseScheduledTime(_req.body.scheduledTime)
            : undefined;
        if (_req.body?.scheduledTime !== undefined &&
            _req.body.scheduledTime !== null &&
            scheduledTime === undefined) {
            res.status(400).json({ message: "ScheduledTime không hợp lệ" });
            return;
        }
        const estimatedDurationRaw = _req.body?.estimatedDuration !== undefined
            ? Number(_req.body.estimatedDuration)
            : undefined;
        const estimatedDuration = estimatedDurationRaw !== undefined &&
            Number.isFinite(estimatedDurationRaw)
            ? Math.max(0, Math.floor(estimatedDurationRaw))
            : undefined;
        if (_req.body?.estimatedDuration !== undefined &&
            estimatedDurationRaw !== undefined &&
            !Number.isFinite(estimatedDurationRaw)) {
            res.status(400).json({ message: "EstimatedDuration không hợp lệ" });
            return;
        }
        // Parse daily target duration (max)
        const dailyTargetDurationRaw = _req.body?.dailyTargetDuration !== undefined
            ? Number(_req.body.dailyTargetDuration)
            : undefined;
        const dailyTargetDuration = dailyTargetDurationRaw !== undefined &&
            Number.isFinite(dailyTargetDurationRaw)
            ? Math.max(0, Math.floor(dailyTargetDurationRaw))
            : undefined;
        // Parse daily target min
        const dailyTargetMinRaw = _req.body?.dailyTargetMin !== undefined
            ? Number(_req.body.dailyTargetMin)
            : undefined;
        const dailyTargetMin = dailyTargetMinRaw !== undefined && Number.isFinite(dailyTargetMinRaw)
            ? Math.max(0, Math.floor(dailyTargetMinRaw))
            : undefined;
        const parentTaskIdRaw = _req.body?.parentTaskId !== undefined
            ? String(_req.body.parentTaskId)
            : undefined;
        const parentTaskId = parentTaskIdRaw ? parentTaskIdRaw.trim() : undefined;
        const tags = Array.isArray(_req.body?.tags)
            ? _req.body.tags.map((x) => String(x))
            : undefined;
        const type = parseType(_req.body?.type);
        const allDay = _req.body?.allDay !== undefined ? Boolean(_req.body.allDay) : undefined;
        const guests = parseGuests(_req.body?.guests);
        const guestDetails = parseGuestDetails(_req.body?.guestDetails);
        const location = _req.body?.location !== undefined
            ? String(_req.body.location)
            : undefined;
        const visibility = parseVisibility(_req.body?.visibility);
        const reminderMinutes = parseReminderMinutes(_req.body?.reminderMinutes);
        const recurrence = _req.body?.recurrence !== undefined
            ? String(_req.body.recurrence)
            : undefined;
        const meetingLink = _req.body?.meetingLink !== undefined
            ? String(_req.body.meetingLink)
            : undefined;
        const task = await task_service_1.taskService.create(userId, {
            title: String(_req.body?.title ?? ""),
            description: _req.body?.description !== undefined
                ? String(_req.body.description)
                : undefined,
            startAt,
            deadline,
            priority: parsePriority(_req.body?.priority),
            tags,
            reminderAt,
            type,
            allDay,
            guests,
            guestDetails,
            location,
            visibility,
            reminderMinutes,
            recurrence,
            meetingLink,
            estimatedDuration,
            dailyTargetDuration,
            dailyTargetMin,
            parentTaskId,
            scheduledTime,
        });
        res.status(201).json({ task });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "INVALID_TITLE") {
            res.status(400).json({ message: "Title không hợp lệ" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.createTask = createTask;
const getTaskById = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const task = await task_service_1.taskService.getById(userId, String(_req.params.id));
        res.status(200).json({ task });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "TASK_FORBIDDEN") {
            res.status(403).json({ message: "Không có quyền truy cập task này" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.getTaskById = getTaskById;
const listTasks = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        console.log("listTasks - userId from token:", userId);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const status = parseStatus(_req.query?.status);
        const priority = parsePriority(_req.query?.priority);
        const deadlineQuery = _req.query?.deadline;
        const search = (0, search_helper_1.default)(_req.query);
        const initialPagination = (0, pagination_helper_1.default)({
            currentPage: 1,
            limitItem: 20,
        }, _req.query, 0);
        const page = initialPagination.currentPage;
        const limit = Math.min(initialPagination.limitItem, 100);
        const deadlineFromTo = deadlineQuery && String(deadlineQuery) === "today"
            ? getTodayRange()
            : null;
        const result = await task_service_1.taskService.list(userId, {
            status,
            priority,
            title: search.regex,
            keyword: search.keyword,
            deadlineFrom: deadlineFromTo?.from,
            deadlineTo: deadlineFromTo?.to,
            page,
            limit,
        });
        res.status(200).json(result);
    }
    catch (_err) {
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.listTasks = listTasks;
const listOverdueTasks = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const page = parsePositiveInt(_req.query?.page, 1);
        const limitRaw = parsePositiveInt(_req.query?.limit, 20);
        const limit = Math.min(limitRaw, 100);
        const result = await task_service_1.taskService.overdue(userId, { page, limit });
        res.status(200).json(result);
    }
    catch (_err) {
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.listOverdueTasks = listOverdueTasks;
const updateTask = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const statusRaw = _req.body?.status;
        const status = parseStatus(statusRaw);
        if (statusRaw !== undefined && status === undefined) {
            res.status(400).json({ message: "Status không hợp lệ" });
            return;
        }
        const priorityRaw = _req.body?.priority;
        const priority = parsePriority(priorityRaw);
        if (priorityRaw !== undefined && priority === undefined) {
            res.status(400).json({ message: "Priority không hợp lệ" });
            return;
        }
        const deadlineRaw = _req.body?.deadline !== undefined
            ? String(_req.body.deadline)
            : undefined;
        const deadline = deadlineRaw ? new Date(deadlineRaw) : undefined;
        if (deadlineRaw && Number.isNaN(deadline?.getTime())) {
            res.status(400).json({ message: "Deadline không hợp lệ" });
            return;
        }
        const startAtRaw = _req.body?.startAt !== undefined ? String(_req.body.startAt) : undefined;
        const startAt = startAtRaw ? new Date(startAtRaw) : undefined;
        if (startAtRaw && Number.isNaN(startAt?.getTime())) {
            res.status(400).json({ message: "Ngày bắt đầu không hợp lệ" });
            return;
        }
        const reminderAtRaw = _req.body?.reminderAt !== undefined
            ? String(_req.body.reminderAt)
            : undefined;
        const reminderAt = reminderAtRaw ? new Date(reminderAtRaw) : undefined;
        if (reminderAtRaw && Number.isNaN(reminderAt?.getTime())) {
            res.status(400).json({ message: "ReminderAt không hợp lệ" });
            return;
        }
        const tags = _req.body?.tags !== undefined
            ? Array.isArray(_req.body?.tags)
                ? _req.body.tags.map((x) => String(x))
                : undefined
            : undefined;
        if (_req.body?.tags !== undefined && tags === undefined) {
            res.status(400).json({ message: "Tags không hợp lệ" });
            return;
        }
        const scheduledTimeRaw = _req.body?.scheduledTime;
        const scheduledTime = _req.body?.scheduledTime !== undefined && scheduledTimeRaw !== null
            ? parseScheduledTime(scheduledTimeRaw)
            : scheduledTimeRaw === null
                ? null
                : undefined;
        if (_req.body?.scheduledTime !== undefined &&
            scheduledTimeRaw !== null &&
            scheduledTime === undefined) {
            res.status(400).json({ message: "ScheduledTime không hợp lệ" });
            return;
        }
        const estimatedDurationRaw = _req.body?.estimatedDuration !== undefined
            ? Number(_req.body.estimatedDuration)
            : undefined;
        const estimatedDuration = estimatedDurationRaw !== undefined &&
            Number.isFinite(estimatedDurationRaw)
            ? Math.max(0, Math.floor(estimatedDurationRaw))
            : undefined;
        if (_req.body?.estimatedDuration !== undefined &&
            estimatedDurationRaw !== undefined &&
            !Number.isFinite(estimatedDurationRaw)) {
            res.status(400).json({ message: "EstimatedDuration không hợp lệ" });
            return;
        }
        // Parse daily target duration (max)
        const dailyTargetDurationRaw = _req.body?.dailyTargetDuration !== undefined
            ? Number(_req.body.dailyTargetDuration)
            : undefined;
        const dailyTargetDuration = dailyTargetDurationRaw !== undefined &&
            Number.isFinite(dailyTargetDurationRaw)
            ? Math.max(0, Math.floor(dailyTargetDurationRaw))
            : undefined;
        // Parse daily target min
        const dailyTargetMinRaw = _req.body?.dailyTargetMin !== undefined
            ? Number(_req.body.dailyTargetMin)
            : undefined;
        const dailyTargetMin = dailyTargetMinRaw !== undefined && Number.isFinite(dailyTargetMinRaw)
            ? Math.max(0, Math.floor(dailyTargetMinRaw))
            : undefined;
        const parentTaskIdRaw = _req.body?.parentTaskId !== undefined
            ? String(_req.body.parentTaskId)
            : undefined;
        const parentTaskId = parentTaskIdRaw ? parentTaskIdRaw.trim() : undefined;
        let aiBreakdown;
        if (_req.body?.aiBreakdown !== undefined) {
            if (!Array.isArray(_req.body.aiBreakdown)) {
                res.status(400).json({ message: "AiBreakdown không hợp lệ" });
                return;
            }
            aiBreakdown = [];
            for (const x of _req.body.aiBreakdown) {
                const title = String(x?.title ?? "");
                const statusRaw = x?.status;
                const status = statusRaw !== undefined ? parseStatus(statusRaw) : undefined;
                if (statusRaw !== undefined && status === undefined) {
                    res
                        .status(400)
                        .json({ message: "AiBreakdown có status không hợp lệ" });
                    return;
                }
                const estRaw = x?.estimatedDuration !== undefined
                    ? Number(x.estimatedDuration)
                    : undefined;
                const estimatedDuration = estRaw !== undefined && Number.isFinite(estRaw)
                    ? Math.max(0, Math.floor(estRaw))
                    : undefined;
                if (x?.estimatedDuration !== undefined &&
                    (estRaw === undefined || !Number.isFinite(estRaw))) {
                    res
                        .status(400)
                        .json({ message: "AiBreakdown có estimatedDuration không hợp lệ" });
                    return;
                }
                aiBreakdown.push({
                    title,
                    status,
                    estimatedDuration,
                });
            }
        }
        const typeUpdate = parseType(_req.body?.type);
        const allDayUpdate = _req.body?.allDay !== undefined ? Boolean(_req.body.allDay) : undefined;
        const guestsUpdate = parseGuests(_req.body?.guests);
        const guestDetailsUpdate = parseGuestDetails(_req.body?.guestDetails);
        const locationUpdate = _req.body?.location !== undefined
            ? String(_req.body.location)
            : undefined;
        const visibilityUpdate = parseVisibility(_req.body?.visibility);
        const reminderMinutesUpdate = parseReminderMinutes(_req.body?.reminderMinutes);
        const recurrenceUpdate = _req.body?.recurrence !== undefined
            ? String(_req.body.recurrence)
            : undefined;
        const meetingLinkUpdate = _req.body?.meetingLink !== undefined
            ? String(_req.body.meetingLink)
            : undefined;
        const task = await task_service_1.taskService.update(userId, String(_req.params.id), {
            title: _req.body?.title !== undefined ? String(_req.body.title) : undefined,
            description: _req.body?.description !== undefined
                ? String(_req.body.description)
                : undefined,
            status,
            priority,
            startAt,
            deadline,
            tags,
            reminderAt,
            type: typeUpdate,
            allDay: allDayUpdate,
            guests: guestsUpdate,
            guestDetails: guestDetailsUpdate,
            location: locationUpdate,
            visibility: visibilityUpdate,
            reminderMinutes: reminderMinutesUpdate,
            recurrence: recurrenceUpdate,
            meetingLink: meetingLinkUpdate,
            scheduledTime: scheduledTime === null
                ? null
                : scheduledTime
                    ? {
                        start: scheduledTime.start,
                        end: scheduledTime.end,
                        aiPlanned: scheduledTime.aiPlanned ?? false,
                        reason: scheduledTime.reason,
                    }
                    : undefined,
            estimatedDuration,
            dailyTargetDuration,
            dailyTargetMin,
            parentTaskId,
            aiBreakdown,
        });
        res.status(200).json({ task });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "INVALID_TITLE") {
            res.status(400).json({ message: "Title không hợp lệ" });
            return;
        }
        if (message === "TASK_FORBIDDEN") {
            res.status(403).json({ message: "Không có quyền cập nhật task này" });
            return;
        }
        if (message.startsWith("TEAM_TASK_EDIT_RESTRICTED:")) {
            const teamId = message.split(":")[1];
            res.status(403).json({
                message: "Đây là công việc trong team. Vui lòng vào trang Team để chỉnh sửa.",
                teamId,
            });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.updateTask = updateTask;
const deleteTask = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const result = await task_service_1.taskService.delete(userId, String(_req.params.id));
        res.status(200).json(result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "TASK_FORBIDDEN") {
            res.status(403).json({ message: "Không có quyền xóa task này" });
            return;
        }
        if (message.startsWith("TEAM_TASK_DELETE_RESTRICTED:")) {
            const teamId = message.split(":")[1];
            res.status(403).json({
                message: "Không thể xóa tại đây. Vui lòng vào Team để xóa công việc nhóm.",
                teamId,
            });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.deleteTask = deleteTask;
/**
 * Quick update task status (for status dropdown)
 * PATCH /tasks/:id/status
 */
const updateTaskStatus = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const taskId = String(_req.params.id ?? "").trim();
        if (!taskId) {
            res.status(400).json({ message: "Task ID không hợp lệ" });
            return;
        }
        const statusRaw = _req.body?.status;
        const status = parseStatus(statusRaw);
        if (!status) {
            res.status(400).json({
                message: "Status không hợp lệ. Phải là: todo, scheduled, in_progress, completed, cancelled",
            });
            return;
        }
        const task = await task_service_1.taskService.updateStatus(userId, taskId, status);
        res.status(200).json({
            task,
            message: `Đã cập nhật trạng thái thành ${status}`,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "TASK_FORBIDDEN") {
            res.status(403).json({ message: "Không có quyền cập nhật task này" });
            return;
        }
        if (message.startsWith("TEAM_TASK_STATUS_RESTRICTED:")) {
            const teamId = message.split(":")[1];
            res.status(403).json({
                message: "Đây là công việc trong team. Hãy cập nhật trạng thái trong trang Team.",
                teamId,
            });
            return;
        }
        if (message === "INVALID_ID") {
            res.status(400).json({ message: "ID không hợp lệ" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.updateTaskStatus = updateTaskStatus;
const saveAISchedule = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const { schedule, suggestedOrder, personalizationNote, totalEstimatedTime, splitStrategy, confidenceScore, sourceTasks, } = _req.body;
        if (!Array.isArray(schedule)) {
            res.status(400).json({ message: "Schedule phải là một mảng" });
            return;
        }
        // Transform schedule data để match với AISchedule format
        const transformedSchedule = schedule.map((dayItem) => ({
            day: String(dayItem?.day ?? ""),
            date: String(dayItem?.date ?? ""),
            tasks: Array.isArray(dayItem?.tasks)
                ? dayItem.tasks.map((t) => ({
                    sessionId: String(t?.sessionId ?? `${t?.taskId}_${dayItem.date}`),
                    taskId: String(t?.taskId ?? ""),
                    title: String(t?.title ?? ""),
                    priority: String(t?.priority ?? "medium"),
                    suggestedTime: String(t?.suggestedTime ?? ""),
                    reason: String(t?.reason ?? ""),
                    status: "pending",
                    createSubtask: Boolean(t?.createSubtask),
                }))
                : [],
            note: dayItem?.note ? String(dayItem.note) : undefined,
        }));
        // 1. Save to AISchedule collection (for history)
        const result = await ai_schedule_service_1.aiScheduleService.createSchedule(userId, {
            name: "AI Schedule Plan",
            description: personalizationNote,
            schedule: transformedSchedule,
            suggestedOrder: Array.isArray(suggestedOrder) ? suggestedOrder : [],
            personalizationNote,
            totalEstimatedTime,
            splitStrategy,
            confidenceScore,
            sourceTasks: Array.isArray(sourceTasks) ? sourceTasks : [],
        });
        // 2. Update tasks with scheduled time and status ⭐ IMPORTANT
        const tasksToUpdate = [];
        for (const dayItem of transformedSchedule) {
            for (const task of dayItem.tasks) {
                // Parse suggestedTime (e.g., "08:00 - 09:00")
                const timeMatch = task.suggestedTime.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
                if (!timeMatch)
                    continue;
                const [, startHour, startMinute, endHour, endMinute] = timeMatch;
                // Parse date (e.g., "2026-03-08")
                const dateMatch = dayItem.date.match(/(\d{4})-(\d{2})-(\d{2})/);
                if (!dateMatch)
                    continue;
                const [, year, month, day] = dateMatch;
                // Create Date objects (local time)
                // NOTE: Using Date.UTC here will shift the time when displayed/used in local timezone,
                // causing reminders to trigger at the wrong time unless user manually edits the event.
                const startDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(startHour), parseInt(startMinute));
                const endDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(endHour), parseInt(endMinute));
                tasksToUpdate.push({
                    sessionId: task.sessionId,
                    taskId: task.taskId,
                    title: task.title,
                    createSubtask: task.createSubtask,
                    scheduledTime: {
                        start: startDate,
                        end: endDate,
                        aiPlanned: true,
                        reason: task.reason,
                    },
                });
            }
        }
        // Update tasks in database
        const updateResult = await task_service_1.taskService.saveAISchedule(userId, tasksToUpdate);
        console.log(`[Save Schedule] Updated ${updateResult.updated} tasks, created ${updateResult.created} subtasks`);
        const totalSessions = transformedSchedule.reduce((sum, day) => sum + (day.tasks?.length || 0), 0);
        res.status(200).json({
            message: `Đã lưu lịch trình với ${totalSessions} phiên làm việc`,
            scheduleId: result.id,
            totalSessions,
            totalDays: transformedSchedule.length,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "User ID không hợp lệ" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống", error: message });
    }
};
exports.saveAISchedule = saveAISchedule;
/**
 * Clear scheduled time from specific tasks
 * DELETE /tasks/schedule/clear
 */
const clearScheduledTime = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const { taskIds } = _req.body;
        if (!Array.isArray(taskIds)) {
            res.status(400).json({ message: "taskIds phải là một mảng" });
            return;
        }
        const result = await task_service_1.taskService.clearScheduledTime(userId, taskIds);
        res.status(200).json({
            message: `Đã xóa lịch trình của ${result.updated} tasks`,
            updated: result.updated,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "User ID không hợp lệ" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống", error: message });
    }
};
exports.clearScheduledTime = clearScheduledTime;
/**
 * Clear all scheduled times for user (emergency cleanup)
 * DELETE /tasks/schedule/clear-all
 */
const clearAllScheduledTimes = async (_req, res) => {
    try {
        const userId = _req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const result = await task_service_1.taskService.clearAllScheduledTimes(userId);
        res.status(200).json({
            message: `Đã xóa tất cả lịch trình (${result.updated} tasks)`,
            updated: result.updated,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "User ID không hợp lệ" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống", error: message });
    }
};
exports.clearAllScheduledTimes = clearAllScheduledTimes;
