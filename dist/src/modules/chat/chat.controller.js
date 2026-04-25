"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatController = void 0;
const chat_service_1 = require("./chat.service");
const presence_service_1 = require("./presence.service");
const cloudinary_service_1 = require("../../services/cloudinary.service");
const cloudinary_1 = require("cloudinary");
const streamifier_1 = __importDefault(require("streamifier"));
const auth_model_1 = require("../auth/auth.model");
const handleError = (res, err, fallback = "Đã xảy ra lỗi") => {
    const status = err?.status || 500;
    res.status(status).json({ message: err?.message || fallback });
};
const uploadRawBuffer = (buffer, opts) => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
        return Promise.reject(new Error("Missing env CLOUDINARY"));
    }
    cloudinary_1.v2.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
    });
    return new Promise((resolve, reject) => {
        const stream = cloudinary_1.v2.uploader.upload_stream({ folder: opts.folder, resource_type: opts.resourceType }, (error, result) => {
            if (error || !result) {
                reject(error || new Error("UPLOAD_FAILED"));
                return;
            }
            resolve({
                url: result.secure_url || result.url,
                publicId: result.public_id,
                width: result.width,
                height: result.height,
                duration: result.duration,
                bytes: result.bytes,
                format: result.format,
            });
        });
        streamifier_1.default.createReadStream(buffer).pipe(stream);
    });
};
exports.chatController = {
    createDirectConversation: async (req, res) => {
        try {
            const userId = req.user?.userId;
            const { userId: otherUserId } = req.body || {};
            if (!otherUserId) {
                res.status(400).json({ message: "userId là bắt buộc" });
                return;
            }
            const conversation = await chat_service_1.chatService.createDirectConversation(userId, String(otherUserId));
            res.status(200).json({ conversation });
        }
        catch (err) {
            handleError(res, err, "Không thể tạo cuộc trò chuyện");
        }
    },
    getOrCreateTeamConversation: async (req, res) => {
        try {
            const userId = req.user?.userId;
            const { teamId } = req.body || {};
            if (!teamId) {
                res.status(400).json({ message: "teamId là bắt buộc" });
                return;
            }
            const conversation = await chat_service_1.chatService.getOrCreateTeamConversation(String(teamId), userId);
            res.status(200).json({ conversation });
        }
        catch (err) {
            handleError(res, err, "Không thể tạo cuộc trò chuyện nhóm");
        }
    },
    listConversations: async (req, res) => {
        try {
            const userId = req.user?.userId;
            const limit = parseInt(req.query.limit) || 30;
            const offset = parseInt(req.query.offset) || 0;
            const search = req.query.search || undefined;
            const conversations = await chat_service_1.chatService.listUserConversations(userId, {
                limit,
                offset,
                search,
            });
            res.status(200).json({ conversations });
        }
        catch (err) {
            handleError(res, err, "Không thể tải danh sách cuộc trò chuyện");
        }
    },
    getConversation: async (req, res) => {
        try {
            const userId = req.user?.userId;
            const { conversationId } = req.params;
            const conversation = await chat_service_1.chatService.getConversation(String(conversationId), userId);
            res.status(200).json({ conversation });
        }
        catch (err) {
            handleError(res, err, "Không thể tải cuộc trò chuyện");
        }
    },
    sendMessage: async (req, res) => {
        try {
            const userId = req.user?.userId;
            const { conversationId } = req.params;
            const { content, type, attachments, replyTo } = req.body || {};
            const message = await chat_service_1.chatService.sendMessage(String(conversationId), userId, { content, type, attachments, replyTo });
            res.status(201).json({ message });
        }
        catch (err) {
            handleError(res, err, "Không thể gửi tin nhắn");
        }
    },
    listMessages: async (req, res) => {
        try {
            const userId = req.user?.userId;
            const { conversationId } = req.params;
            const limit = parseInt(req.query.limit) || 30;
            const before = req.query.before || undefined;
            const after = req.query.after || undefined;
            const messages = await chat_service_1.chatService.listMessages(String(conversationId), userId, { limit, before, after });
            res.status(200).json({ messages });
        }
        catch (err) {
            handleError(res, err, "Không thể tải tin nhắn");
        }
    },
    markAllAsSeen: async (req, res) => {
        try {
            const userId = req.user?.userId;
            const { conversationId } = req.params;
            await chat_service_1.chatService.markAllAsSeen(String(conversationId), userId);
            res.status(200).json({ message: "OK" });
        }
        catch (err) {
            handleError(res, err, "Không thể đánh dấu đã xem");
        }
    },
    reactMessage: async (req, res) => {
        try {
            const userId = req.user?.userId;
            const { messageId } = req.params;
            const { emoji, action } = req.body || {};
            if (!emoji || !["add", "remove"].includes(action)) {
                res
                    .status(400)
                    .json({ message: "emoji và action (add/remove) là bắt buộc" });
                return;
            }
            const message = await chat_service_1.chatService.toggleReaction(String(messageId), userId, String(emoji), action);
            res.status(200).json({ message });
        }
        catch (err) {
            handleError(res, err, "Không thể react");
        }
    },
    editMessage: async (req, res) => {
        try {
            const userId = req.user?.userId;
            const { messageId } = req.params;
            const { content } = req.body || {};
            if (typeof content !== "string") {
                res.status(400).json({ message: "content là bắt buộc" });
                return;
            }
            const message = await chat_service_1.chatService.editMessage(String(messageId), userId, content);
            res.status(200).json({ message });
        }
        catch (err) {
            handleError(res, err, "Không thể sửa tin nhắn");
        }
    },
    deleteMessage: async (req, res) => {
        try {
            const userId = req.user?.userId;
            const { messageId } = req.params;
            const message = await chat_service_1.chatService.deleteMessage(String(messageId), userId);
            res.status(200).json({ message });
        }
        catch (err) {
            handleError(res, err, "Không thể xóa tin nhắn");
        }
    },
    uploadAttachment: async (req, res) => {
        try {
            const file = req.file;
            if (!file) {
                res.status(400).json({ message: "Chưa có file đính kèm" });
                return;
            }
            const mime = file.mimetype || "";
            let kind = "file";
            let resourceType = "raw";
            if (mime.startsWith("image/")) {
                kind = "image";
                resourceType = "image";
            }
            else if (mime.startsWith("video/")) {
                kind = "video";
                resourceType = "video";
            }
            let uploaded;
            if (kind === "image") {
                const r = await (0, cloudinary_service_1.uploadImageBuffer)(file.buffer, { folder: "chat" });
                uploaded = { url: r.url, publicId: r.publicId };
            }
            else {
                uploaded = await uploadRawBuffer(file.buffer, {
                    folder: "chat",
                    resourceType,
                });
            }
            const attachment = {
                kind,
                url: uploaded.url,
                publicId: uploaded.publicId,
                name: file.originalname,
                mimeType: mime,
                size: file.size,
                width: uploaded.width,
                height: uploaded.height,
                duration: uploaded.duration,
            };
            res.status(200).json({ attachment });
        }
        catch (err) {
            handleError(res, err, "Không thể tải tệp lên");
        }
    },
    searchUsers: async (req, res) => {
        try {
            const userId = req.user?.userId;
            const q = String(req.query.q || "").trim();
            if (!q || q.length < 1) {
                res.status(200).json({ users: [] });
                return;
            }
            const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            const users = await auth_model_1.User.find({
                _id: { $ne: userId },
                $or: [{ name: regex }, { email: regex }],
            })
                .select("_id name email avatar")
                .limit(20)
                .lean();
            res.status(200).json({
                users: users.map((u) => ({
                    id: String(u._id),
                    name: u.name,
                    email: u.email,
                    avatar: u.avatar,
                })),
            });
        }
        catch (err) {
            handleError(res, err, "Không thể tìm người dùng");
        }
    },
    getOnlineUsers: async (_req, res) => {
        try {
            const onlineUsers = await presence_service_1.presenceService.getOnlineUsers();
            res.status(200).json({ onlineUsers });
        }
        catch (err) {
            handleError(res, err, "Không thể lấy trạng thái online");
        }
    },
    getTypingUsers: async (req, res) => {
        try {
            const { conversationId } = req.params;
            const typingUsers = await presence_service_1.presenceService.getTypingUsers(String(conversationId));
            res.status(200).json({ conversationId, typingUsers });
        }
        catch (err) {
            handleError(res, err, "Không thể lấy trạng thái đang gõ");
        }
    },
};
