"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.renameConversation = exports.deleteConversation = exports.smartReschedule = exports.schedulePlan = exports.prioritySuggest = exports.taskBreakdown = exports.getConversationById = exports.listConversations = exports.chatStream = exports.chat = void 0;
const ai_service_1 = require("./ai.service");
const ai_streaming_service_1 = require("./ai.streaming.service");
const getUserId = (req) => {
    const userId = req.user?.userId;
    return userId ? String(userId) : null;
};
const chat = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const body = req.body ?? {};
        const message = String(body?.message ?? "").trim();
        if (!message) {
            res.status(400).json({ message: "Message không hợp lệ" });
            return;
        }
        const modelRaw = body?.model;
        const model = modelRaw !== undefined && modelRaw !== null
            ? String(modelRaw).trim()
            : undefined;
        const temperatureRaw = body?.temperature;
        const temperature = temperatureRaw !== undefined && temperatureRaw !== null
            ? Number(temperatureRaw)
            : undefined;
        if (temperature !== undefined &&
            (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
            res.status(400).json({ message: "Temperature không hợp lệ" });
            return;
        }
        const maxTokensRaw = body?.maxTokens;
        const maxTokens = maxTokensRaw !== undefined && maxTokensRaw !== null
            ? Number(maxTokensRaw)
            : undefined;
        if (maxTokens !== undefined &&
            (!Number.isFinite(maxTokens) || Math.floor(maxTokens) <= 0)) {
            res.status(400).json({ message: "MaxTokens không hợp lệ" });
            return;
        }
        const conversationIdRaw = body?.conversationId;
        const conversationId = conversationIdRaw !== undefined && conversationIdRaw !== null
            ? String(conversationIdRaw).trim()
            : undefined;
        const result = await ai_service_1.aiService.chat(userId, {
            message,
            conversationId,
            model,
            temperature,
            maxTokens: maxTokens !== undefined ? Math.floor(maxTokens) : undefined,
        });
        res.status(200).json(result);
    }
    catch (err) {
        const error = err instanceof Error ? err : new Error("UNKNOWN");
        console.error("[AI_CHAT_ERROR]", error);
        const message = error.message;
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "UserId không hợp lệ" });
            return;
        }
        if (message === "CONVERSATION_ID_INVALID") {
            res.status(400).json({ message: "ConversationId không hợp lệ" });
            return;
        }
        if (message === "NOT_IMPLEMENTED") {
            res.status(501).json({ message: "Chức năng chưa triển khai" });
            return;
        }
        if (message === "GROQ_API_KEY_MISSING") {
            res.status(500).json({
                message: "Thiếu GROQ_API_KEY trong env",
                ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
            });
            return;
        }
        if (message === "GROQ_UNAUTHORIZED") {
            res.status(500).json({
                message: "Groq bị từ chối (API key không hợp lệ hoặc không có quyền).",
                ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
            });
            return;
        }
        if (message === "GROQ_RATE_LIMIT") {
            res.status(429).json({
                message: "Groq bị giới hạn rate limit. Thử lại sau.",
                ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
            });
            return;
        }
        if (message === "CONVERSATION_FORBIDDEN") {
            res
                .status(403)
                .json({ message: "Không có quyền truy cập conversation này" });
            return;
        }
        const lower = message.toLowerCase();
        if (lower.includes("permission") ||
            lower.includes("unauthorized") ||
            lower.includes("403")) {
            res.status(500).json({
                message: "Provider AI bị từ chối (permission/quota/billing). Kiểm tra API key và quyền truy cập.",
                ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
            });
            return;
        }
        if (lower.includes("quota") ||
            lower.includes("rate") ||
            lower.includes("429")) {
            res.status(429).json({
                message: "Provider AI bị giới hạn quota/rate limit. Thử lại sau.",
                ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
            });
            return;
        }
        if (lower.includes("model") &&
            (lower.includes("not found") || lower.includes("invalid"))) {
            res.status(500).json({
                message: "AI model không hợp lệ. Kiểm tra cấu hình model.",
                ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
            });
            return;
        }
        res.status(500).json({
            message: "Lỗi hệ thống",
            ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
        });
    }
};
exports.chat = chat;
const chatStream = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const body = req.body ?? {};
        const message = String(body?.message ?? "").trim();
        if (!message) {
            res.status(400).json({ message: "Message không hợp lệ" });
            return;
        }
        const modelRaw = body?.model;
        const model = modelRaw !== undefined && modelRaw !== null
            ? String(modelRaw).trim()
            : undefined;
        const temperatureRaw = body?.temperature;
        const temperature = temperatureRaw !== undefined && temperatureRaw !== null
            ? Number(temperatureRaw)
            : undefined;
        if (temperature !== undefined &&
            (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
            res.status(400).json({ message: "Temperature không hợp lệ" });
            return;
        }
        const maxTokensRaw = body?.maxTokens;
        const maxTokens = maxTokensRaw !== undefined && maxTokensRaw !== null
            ? Number(maxTokensRaw)
            : undefined;
        if (maxTokens !== undefined &&
            (!Number.isFinite(maxTokens) || Math.floor(maxTokens) <= 0)) {
            res.status(400).json({ message: "MaxTokens không hợp lệ" });
            return;
        }
        const conversationIdRaw = body?.conversationId;
        const conversationId = conversationIdRaw !== undefined && conversationIdRaw !== null
            ? String(conversationIdRaw).trim()
            : undefined;
        ai_streaming_service_1.aiStreamingService.initSse(res);
        let closed = false;
        req.on("close", () => {
            closed = true;
        });
        const stream = ai_service_1.aiService.chatStream(userId, {
            message,
            conversationId,
            model,
            temperature,
            maxTokens: maxTokens !== undefined ? Math.floor(maxTokens) : undefined,
        });
        for await (const ev of stream) {
            if (closed) {
                return;
            }
            if (ev.type === "meta") {
                ai_streaming_service_1.aiStreamingService.sendSseEvent(res, { conversationId: ev.conversationId }, "meta");
            }
            else if (ev.type === "delta") {
                ai_streaming_service_1.aiStreamingService.sendSseEvent(res, { delta: ev.delta }, "chunk");
            }
            else {
                ai_streaming_service_1.aiStreamingService.sendSseEvent(res, { model: ev.model, usage: ev.usage }, "done");
            }
        }
        if (!closed) {
            ai_streaming_service_1.aiStreamingService.closeSse(res);
        }
    }
    catch (err) {
        const error = err instanceof Error ? err : new Error("UNKNOWN");
        console.error("[AI_CHAT_STREAM_ERROR]", error);
        const message = error.message;
        // If SSE already started, send an error event
        if (res.headersSent) {
            const payload = {
                message: message === "CONVERSATION_FORBIDDEN"
                    ? "Không có quyền truy cập conversation này"
                    : message === "CONVERSATION_ID_INVALID"
                        ? "ConversationId không hợp lệ"
                        : message === "USER_ID_INVALID"
                            ? "UserId không hợp lệ"
                            : "Lỗi hệ thống",
                ...(process.env.NODE_ENV !== "production"
                    ? { detail: error.message }
                    : {}),
            };
            ai_streaming_service_1.aiStreamingService.sendSseEvent(res, payload, "error");
            ai_streaming_service_1.aiStreamingService.closeSse(res);
            return;
        }
        if (message === "GROQ_RATE_LIMIT") {
            res
                .status(429)
                .json({ message: "Groq bị giới hạn rate limit. Thử lại sau." });
            return;
        }
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "UserId không hợp lệ" });
            return;
        }
        if (message === "CONVERSATION_ID_INVALID") {
            res.status(400).json({ message: "ConversationId không hợp lệ" });
            return;
        }
        if (message === "CONVERSATION_FORBIDDEN") {
            res
                .status(403)
                .json({ message: "Không có quyền truy cập conversation này" });
            return;
        }
        if (message === "GROQ_UNAUTHORIZED") {
            res.status(500).json({
                message: "Groq bị từ chối (API key không hợp lệ hoặc không có quyền).",
            });
            return;
        }
        if (message === "GROQ_API_KEY_MISSING") {
            res.status(500).json({ message: "Thiếu GROQ_API_KEY trong env" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.chatStream = chatStream;
const listConversations = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const limitRaw = req.query?.limit;
        const limit = limitRaw !== undefined && limitRaw !== null
            ? Number(limitRaw)
            : undefined;
        const result = await ai_service_1.aiService.listConversations(userId, {
            limit: limit !== undefined && Number.isFinite(limit)
                ? Math.floor(limit)
                : undefined,
        });
        res.status(200).json(result);
    }
    catch (err) {
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.listConversations = listConversations;
const getConversationById = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const id = String(req.params?.id ?? "").trim();
        if (!id) {
            res.status(400).json({ message: "Conversation id không hợp lệ" });
            return;
        }
        const limitRaw = req.query?.limit;
        const limit = limitRaw !== undefined && limitRaw !== null
            ? Number(limitRaw)
            : undefined;
        const result = await ai_service_1.aiService.getConversationById(userId, {
            id,
            limitMessages: limit !== undefined && Number.isFinite(limit)
                ? Math.floor(limit)
                : undefined,
        });
        res.status(200).json(result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "CONVERSATION_ID_INVALID") {
            res.status(400).json({ message: "Conversation id không hợp lệ" });
            return;
        }
        if (message === "CONVERSATION_FORBIDDEN") {
            res
                .status(403)
                .json({ message: "Không có quyền truy cập conversation này" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.getConversationById = getConversationById;
const taskBreakdown = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const title = String(req.body?.title ?? "").trim();
        const deadlineRaw = req.body?.deadline;
        const deadline = deadlineRaw ? new Date(String(deadlineRaw)) : undefined;
        if (!title) {
            res.status(400).json({ message: "Title không hợp lệ" });
            return;
        }
        if (deadlineRaw && Number.isNaN(deadline?.getTime())) {
            res.status(400).json({ message: "Deadline không hợp lệ" });
            return;
        }
        const result = await ai_service_1.aiService.taskBreakdown(userId, { title, deadline });
        res.status(200).json(result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "UserId không hợp lệ" });
            return;
        }
        if (message === "AI_JSON_INVALID" || message === "AI_RESPONSE_INVALID") {
            res.status(500).json({
                message: "AI trả về dữ liệu không đúng định dạng. Thử lại sau.",
                ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
            });
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
        if (message === "GROQ_RATE_LIMIT") {
            res.status(429).json({
                message: "Groq bị giới hạn rate limit. Thử lại sau.",
            });
            return;
        }
        if (message === "NOT_IMPLEMENTED") {
            res.status(501).json({ message: "Chức năng chưa triển khai" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.taskBreakdown = taskBreakdown;
const prioritySuggest = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const title = String(req.body?.title ?? "").trim();
        const deadlineRaw = req.body?.deadline;
        const deadline = deadlineRaw ? new Date(String(deadlineRaw)) : undefined;
        if (!title) {
            res.status(400).json({ message: "Title không hợp lệ" });
            return;
        }
        if (deadlineRaw && Number.isNaN(deadline?.getTime())) {
            res.status(400).json({ message: "Deadline không hợp lệ" });
            return;
        }
        const result = await ai_service_1.aiService.prioritySuggest(userId, { title, deadline });
        res.status(200).json(result);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "UserId không hợp lệ" });
            return;
        }
        if (message === "AI_JSON_INVALID") {
            res.status(500).json({
                message: "AI trả về dữ liệu không đúng định dạng. Thử lại sau.",
                ...(process.env.NODE_ENV !== "production" ? { detail: message } : {}),
            });
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
        if (message === "GROQ_RATE_LIMIT") {
            res.status(429).json({
                message: "Groq bị giới hạn rate limit. Thử lại sau.",
            });
            return;
        }
        if (message === "NOT_IMPLEMENTED") {
            res.status(501).json({ message: "Chức năng chưa triển khai" });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.prioritySuggest = prioritySuggest;
const schedulePlan = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const taskIds = req.body?.taskIds;
        const startDateRaw = req.body?.startDate;
        if (!Array.isArray(taskIds) || taskIds.length === 0) {
            res.status(400).json({ message: "Danh sách taskIds không hợp lệ" });
            return;
        }
        if (taskIds.length > 20) {
            res
                .status(400)
                .json({ message: "Tối đa 20 công việc trong một lịch trình" });
            return;
        }
        const startDate = startDateRaw ? new Date(startDateRaw) : new Date();
        if (isNaN(startDate.getTime())) {
            res.status(400).json({ message: "Ngày bắt đầu không hợp lệ" });
            return;
        }
        const result = await ai_service_1.aiService.schedulePlan(userId, { taskIds, startDate });
        res.status(200).json(result);
    }
    catch (err) {
        console.error("schedulePlan error:", err);
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "NOT_IMPLEMENTED") {
            res.status(501).json({ message: "Chức năng chưa triển khai" });
            return;
        }
        if (message === "TASK_NOT_FOUND") {
            res.status(404).json({ message: "Không tìm thấy công việc" });
            return;
        }
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "User ID không hợp lệ" });
            return;
        }
        if (message === "TASK_ID_INVALID") {
            res.status(400).json({ message: "Task ID không hợp lệ" });
            return;
        }
        if (message === "AI_JSON_INVALID" || message === "AI_RESPONSE_INVALID") {
            res.status(502).json({ message: "AI trả về phản hồi không hợp lệ" });
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
        if (message === "GROQ_RATE_LIMIT") {
            res.status(429).json({
                message: "Groq bị giới hạn rate limit. Thử lại sau.",
            });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống", error: message });
    }
};
exports.schedulePlan = schedulePlan;
const smartReschedule = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const body = req.body ?? {};
        const missedTask = body?.missedTask;
        const reason = String(body?.reason ?? "missed");
        if (!missedTask || !missedTask.id || !missedTask.title) {
            res.status(400).json({ message: "Thông tin task không hợp lệ" });
            return;
        }
        const result = await ai_service_1.aiService.smartReschedule(userId, {
            missedTask: {
                id: String(missedTask.id),
                title: String(missedTask.title),
                description: missedTask.description,
                priority: String(missedTask.priority ?? "medium"),
                deadline: missedTask.deadline
                    ? new Date(missedTask.deadline)
                    : undefined,
                estimatedDuration: missedTask.estimatedDuration,
                originalScheduledTime: missedTask.originalScheduledTime,
            },
            reason,
        });
        res.status(200).json(result);
    }
    catch (err) {
        console.error("smartReschedule error:", err);
        const message = err instanceof Error ? err.message : "UNKNOWN";
        if (message === "USER_ID_INVALID") {
            res.status(400).json({ message: "User ID không hợp lệ" });
            return;
        }
        if (message === "AI_JSON_INVALID" || message === "AI_RESPONSE_INVALID") {
            res.status(502).json({ message: "AI trả về phản hồi không hợp lệ" });
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
        if (message === "GROQ_RATE_LIMIT") {
            res.status(429).json({
                message: "Groq bị giới hạn rate limit. Thử lại sau.",
            });
            return;
        }
        res.status(500).json({ message: "Lỗi hệ thống", error: message });
    }
};
exports.smartReschedule = smartReschedule;
const deleteConversation = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const { Types } = await Promise.resolve().then(() => __importStar(require("mongoose")));
        const id = String(req.params?.id ?? "").trim();
        if (!id || !Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: "Conversation id không hợp lệ" });
            return;
        }
        const { aiRepository } = await Promise.resolve().then(() => __importStar(require("./ai.repository")));
        const deleted = await aiRepository.deleteConversation({
            conversationId: new Types.ObjectId(id),
            userId: new Types.ObjectId(userId),
        });
        if (!deleted) {
            res.status(403).json({ message: "Không có quyền hoặc không tìm thấy" });
            return;
        }
        res.status(200).json({ message: "Đã xóa cuộc trò chuyện" });
    }
    catch {
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.deleteConversation = deleteConversation;
const renameConversation = async (req, res) => {
    try {
        const userId = getUserId(req);
        if (!userId) {
            res.status(401).json({ message: "Chưa đăng nhập" });
            return;
        }
        const { Types } = await Promise.resolve().then(() => __importStar(require("mongoose")));
        const id = String(req.params?.id ?? "").trim();
        if (!id || !Types.ObjectId.isValid(id)) {
            res.status(400).json({ message: "Conversation id không hợp lệ" });
            return;
        }
        const title = String(req.body?.title ?? "").trim();
        if (!title) {
            res.status(400).json({ message: "Title không được để trống" });
            return;
        }
        const { aiRepository } = await Promise.resolve().then(() => __importStar(require("./ai.repository")));
        const updated = await aiRepository.renameConversation({
            conversationId: new Types.ObjectId(id),
            userId: new Types.ObjectId(userId),
            title,
        });
        if (!updated) {
            res.status(403).json({ message: "Không có quyền hoặc không tìm thấy" });
            return;
        }
        res.status(200).json({ message: "Đã đổi tên", title: updated.title });
    }
    catch {
        res.status(500).json({ message: "Lỗi hệ thống" });
    }
};
exports.renameConversation = renameConversation;
