"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getChatGateway = exports.initChatGateway = exports.ChatGateway = void 0;
const socket_io_1 = require("socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const chat_service_1 = require("./chat.service");
const presence_service_1 = require("./presence.service");
const redis_service_1 = require("../../services/redis.service");
const getAllowedSocketOrigins = () => {
    const fromEnv = [process.env.CLIENT_URL, process.env.FRONTEND_URL]
        .filter((v) => !!v)
        .flatMap((v) => v.split(","))
        .map((v) => v.trim())
        .filter(Boolean);
    return Array.from(new Set([...fromEnv, "http://localhost:5173", "http://localhost:3000"]));
};
const extractTokenFromCookieHeader = (cookieHeader) => {
    if (!cookieHeader)
        return undefined;
    const tokenPair = cookieHeader
        .split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("token="));
    if (!tokenPair)
        return undefined;
    const raw = tokenPair.slice("token=".length);
    try {
        return decodeURIComponent(raw);
    }
    catch {
        return raw;
    }
};
class ChatGateway {
    io;
    userSocketMap = new Map(); // userId -> socketId
    constructor(server) {
        const allowedOrigins = getAllowedSocketOrigins();
        this.io = new socket_io_1.Server(server, {
            cors: {
                origin: (origin, callback) => {
                    if (!origin || allowedOrigins.includes(origin)) {
                        callback(null, true);
                        return;
                    }
                    callback(new Error(`CORS_ORIGIN_NOT_ALLOWED: ${origin}`));
                },
                methods: ["GET", "POST"],
                credentials: true,
            },
        });
        // Setup Redis pub/sub adapter for multi-server scaling
        this.setupRedisAdapter();
        this.setupMiddleware();
        this.setupEventHandlers();
    }
    setupRedisAdapter() {
        try {
            const redis = (0, redis_service_1.getRedis)();
            const pubClient = redis.duplicate();
            const subClient = redis.duplicate();
            this.io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
            console.log("Redis pub/sub adapter enabled for Socket.IO scaling");
        }
        catch (err) {
            console.warn("Failed to setup Redis adapter, running in single-server mode:", err);
        }
    }
    setupMiddleware() {
        this.io.use((socket, next) => {
            try {
                const tokenFromAuth = socket.handshake.auth?.token;
                const tokenFromHeader = socket.handshake.headers.authorization?.replace("Bearer ", "");
                const tokenFromCookie = extractTokenFromCookieHeader(socket.handshake.headers.cookie);
                const token = tokenFromAuth || tokenFromHeader || tokenFromCookie;
                if (!token) {
                    return next(new Error("AUTH_TOKEN_MISSING"));
                }
                const jwtSecret = process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET;
                if (!jwtSecret) {
                    return next(new Error("JWT_SECRET_MISSING"));
                }
                const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
                socket.userId = decoded.userId;
                next();
            }
            catch (err) {
                next(new Error("AUTH_TOKEN_INVALID"));
            }
        });
    }
    setupEventHandlers() {
        this.io.on("connection", (socket) => {
            const userId = socket.userId;
            console.log(`User connected: ${userId}, socket: ${socket.id}`);
            // Store mapping
            this.userSocketMap.set(userId, socket.id);
            // Join personal room for targeted events (conversation updates, calls, notifications)
            socket.join(`user:${userId}`);
            // Set user online
            presence_service_1.presenceService.setUserOnline(userId, socket.id);
            // Broadcast online status to others
            socket.broadcast.emit("user:online", { userId });
            // Send current online users to this user on connect
            presence_service_1.presenceService
                .getOnlineUsers()
                .then((online) => {
                socket.emit("presence:snapshot", { online });
            })
                .catch(() => { });
            // Heartbeat to refresh TTL
            socket.on("presence:ping", async () => {
                await presence_service_1.presenceService.refreshUserOnline(userId);
            });
            // Join conversation
            socket.on("conversation:join", async (data) => {
                try {
                    // Verify user is member
                    await chat_service_1.chatService.getConversation(data.conversationId, userId);
                    socket.join(`conversation:${data.conversationId}`);
                    socket.emit("conversation:joined", {
                        conversationId: data.conversationId,
                    });
                    // Mark all messages as seen
                    await chat_service_1.chatService.markAllAsSeen(data.conversationId, userId);
                }
                catch (err) {
                    socket.emit("error", { message: "Failed to join conversation" });
                }
            });
            // Leave conversation
            socket.on("conversation:leave", (data) => {
                socket.leave(`conversation:${data.conversationId}`);
                socket.emit("conversation:left", {
                    conversationId: data.conversationId,
                });
            });
            // Send message
            socket.on("message:send", async (data) => {
                try {
                    const message = await chat_service_1.chatService.sendMessage(data.conversationId, userId, {
                        content: data.content,
                        type: data.type,
                        attachments: data.attachments,
                        replyTo: data.replyTo,
                    });
                    // Emit to all members in conversation
                    this.io
                        .to(`conversation:${data.conversationId}`)
                        .emit("message:new", { message });
                    // Emit conversation update to each member's personal room so sidebar preview refreshes
                    const conv = await chat_service_1.chatService.getConversation(data.conversationId, userId);
                    for (const m of conv.members) {
                        this.io.to(`user:${m.id}`).emit("conversation:updated", {
                            conversationId: data.conversationId,
                            lastMessage: {
                                content: message.content || "",
                                senderId: message.senderId?.id,
                                createdAt: message.createdAt,
                                type: message.type,
                            },
                        });
                    }
                    socket.emit("message:sent", {
                        message,
                        clientTempId: data.clientTempId,
                    });
                }
                catch (err) {
                    socket.emit("error", {
                        event: "message:send",
                        message: err?.message || "Failed to send message",
                        clientTempId: data.clientTempId,
                    });
                }
            });
            // Message reaction
            socket.on("message:react", async (data) => {
                try {
                    const message = await chat_service_1.chatService.toggleReaction(data.messageId, userId, data.emoji, data.action);
                    this.io
                        .to(`conversation:${data.conversationId}`)
                        .emit("message:reacted", { message });
                }
                catch (err) {
                    socket.emit("error", {
                        event: "message:react",
                        message: err?.message || "Failed to react",
                    });
                }
            });
            // Edit message
            socket.on("message:edit", async (data) => {
                try {
                    const message = await chat_service_1.chatService.editMessage(data.messageId, userId, data.content);
                    this.io
                        .to(`conversation:${data.conversationId}`)
                        .emit("message:updated", { message });
                }
                catch (err) {
                    socket.emit("error", {
                        event: "message:edit",
                        message: err?.message || "Failed to edit message",
                    });
                }
            });
            // Delete message
            socket.on("message:delete", async (data) => {
                try {
                    const message = await chat_service_1.chatService.deleteMessage(data.messageId, userId);
                    this.io
                        .to(`conversation:${data.conversationId}`)
                        .emit("message:updated", { message });
                }
                catch (err) {
                    socket.emit("error", {
                        event: "message:delete",
                        message: err?.message || "Failed to delete message",
                    });
                }
            });
            // ───────── WebRTC Call signaling ─────────
            socket.on("call:invite", async (data) => {
                try {
                    // Log call event to conversation
                    await chat_service_1.chatService.sendCallEventMessage(data.conversationId, userId, {
                        callId: data.callId,
                        kind: data.kind,
                        status: "started",
                        startedAt: new Date(),
                        participants: [],
                    });
                    for (const targetId of data.targetUserIds) {
                        if (String(targetId) === String(userId))
                            continue;
                        this.io.to(`user:${targetId}`).emit("call:incoming", {
                            callId: data.callId,
                            conversationId: data.conversationId,
                            kind: data.kind,
                            fromUserId: userId,
                            fromUser: data.fromUser,
                        });
                    }
                }
                catch (err) {
                    socket.emit("error", {
                        event: "call:invite",
                        message: err?.message || "Failed to invite call",
                    });
                }
            });
            socket.on("call:accept", (data) => {
                this.io.to(`user:${data.toUserId}`).emit("call:accepted", {
                    callId: data.callId,
                    fromUserId: userId,
                });
            });
            socket.on("call:reject", async (data) => {
                this.io.to(`user:${data.toUserId}`).emit("call:rejected", {
                    callId: data.callId,
                    fromUserId: userId,
                });
                try {
                    await chat_service_1.chatService.sendCallEventMessage(data.conversationId, userId, {
                        callId: data.callId,
                        kind: data.kind,
                        status: "rejected",
                        endedAt: new Date(),
                    });
                }
                catch { }
            });
            socket.on("call:end", async (data) => {
                const targets = data.targetUserIds || [];
                for (const uid of targets) {
                    if (String(uid) === String(userId))
                        continue;
                    this.io
                        .to(`user:${uid}`)
                        .emit("call:ended", { callId: data.callId, fromUserId: userId });
                }
                try {
                    await chat_service_1.chatService.sendCallEventMessage(data.conversationId, userId, {
                        callId: data.callId,
                        kind: data.kind,
                        status: "ended",
                        endedAt: new Date(),
                        durationSec: data.durationSec,
                    });
                }
                catch { }
            });
            // WebRTC signaling passthrough
            socket.on("call:signal", (data) => {
                this.io.to(`user:${data.toUserId}`).emit("call:signal", {
                    callId: data.callId,
                    fromUserId: userId,
                    signal: data.signal,
                    type: data.type,
                });
            });
            // Typing indicator
            socket.on("typing:start", async (data) => {
                await presence_service_1.presenceService.setUserTyping(data.conversationId, userId);
                socket.to(`conversation:${data.conversationId}`).emit("typing:update", {
                    conversationId: data.conversationId,
                    userId,
                    typing: true,
                });
            });
            socket.on("typing:stop", async (data) => {
                await presence_service_1.presenceService.clearUserTyping(data.conversationId, userId);
                socket.to(`conversation:${data.conversationId}`).emit("typing:update", {
                    conversationId: data.conversationId,
                    userId,
                    typing: false,
                });
            });
            // Mark message as seen
            socket.on("message:seen", async (data) => {
                try {
                    await chat_service_1.chatService.markAsSeen(data.messageId, userId);
                    this.io
                        .to(`conversation:${data.conversationId}`)
                        .emit("message:seen", { messageId: data.messageId, userId });
                }
                catch (err) {
                    // Silent fail
                }
            });
            // Disconnect
            socket.on("disconnect", async () => {
                console.log(`User disconnected: ${userId}`);
                this.userSocketMap.delete(userId);
                await presence_service_1.presenceService.setUserOffline(userId);
                // Broadcast offline status
                socket.broadcast.emit("user:offline", { userId });
            });
        });
    }
    // Public method to emit events from outside (e.g., from REST API)
    emitToUser(userId, event, data) {
        const socketId = this.userSocketMap.get(userId);
        if (socketId) {
            this.io.to(socketId).emit(event, data);
        }
    }
    emitToConversation(conversationId, event, data) {
        this.io.to(`conversation:${conversationId}`).emit(event, data);
    }
    getIO() {
        return this.io;
    }
}
exports.ChatGateway = ChatGateway;
let chatGatewayInstance = null;
const initChatGateway = (server) => {
    if (!chatGatewayInstance) {
        chatGatewayInstance = new ChatGateway(server);
    }
    return chatGatewayInstance;
};
exports.initChatGateway = initChatGateway;
const getChatGateway = () => {
    return chatGatewayInstance;
};
exports.getChatGateway = getChatGateway;
