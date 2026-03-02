"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatController = void 0;
const chat_service_1 = require("./chat.service");
const presence_service_1 = require("./presence.service");
exports.chatController = {
    // Create or get direct conversation
    createDirectConversation: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const { userId: otherUserId } = req.body;
            if (!otherUserId) {
                res.status(400).json({ message: "userId is required" });
                return;
            }
            const conversation = await chat_service_1.chatService.createDirectConversation(userId, otherUserId);
            res.status(200).json({ conversation });
        }
        catch (err) {
            res.status(500).json({ message: "Failed to create conversation" });
        }
    },
    // Get or create task conversation
    getOrCreateTaskConversation: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const { taskId, members } = req.body;
            if (!taskId || !members || !Array.isArray(members)) {
                res.status(400).json({ message: "taskId and members are required" });
                return;
            }
            const conversation = await chat_service_1.chatService.getOrCreateTaskConversation(taskId, members);
            res.status(200).json({ conversation });
        }
        catch (err) {
            res
                .status(500)
                .json({ message: "Failed to get/create task conversation" });
        }
    },
    // List user's conversations
    listConversations: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const limit = parseInt(req.query.limit) || 20;
            const offset = parseInt(req.query.offset) || 0;
            const conversations = await chat_service_1.chatService.listUserConversations(userId, {
                limit,
                offset,
            });
            res.status(200).json({ conversations });
        }
        catch (err) {
            res.status(500).json({ message: "Failed to list conversations" });
        }
    },
    // Get conversation details
    getConversation: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const { conversationId } = req.params;
            const conversation = await chat_service_1.chatService.getConversation(String(conversationId), userId);
            res.status(200).json({ conversation });
        }
        catch (err) {
            if (err.message === "CONVERSATION_NOT_FOUND") {
                res.status(404).json({ message: "Conversation not found" });
            }
            else {
                res.status(500).json({ message: "Failed to get conversation" });
            }
        }
    },
    // Send message via REST (fallback for non-socket clients)
    sendMessage: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const { conversationId } = req.params;
            const { content, type } = req.body;
            if (!content || typeof content !== "string") {
                res.status(400).json({ message: "content is required" });
                return;
            }
            const message = await chat_service_1.chatService.sendMessage(String(conversationId), userId, content, type || "text");
            res.status(201).json({ message });
        }
        catch (err) {
            if (err.message === "CONVERSATION_NOT_FOUND") {
                res.status(404).json({ message: "Conversation not found" });
            }
            else {
                res.status(500).json({ message: "Failed to send message" });
            }
        }
    },
    // List messages
    listMessages: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const { conversationId } = req.params;
            const limit = parseInt(req.query.limit) || 50;
            const offset = parseInt(req.query.offset) || 0;
            const messages = await chat_service_1.chatService.listMessages(String(conversationId), userId, { limit, offset });
            res.status(200).json({ messages });
        }
        catch (err) {
            if (err.message === "CONVERSATION_NOT_FOUND") {
                res.status(404).json({ message: "Conversation not found" });
            }
            else {
                res.status(500).json({ message: "Failed to list messages" });
            }
        }
    },
    // Mark all messages as seen
    markAllAsSeen: async (req, res) => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            const { conversationId } = req.params;
            await chat_service_1.chatService.markAllAsSeen(String(conversationId), userId);
            res.status(200).json({ message: "All messages marked as seen" });
        }
        catch (err) {
            if (err.message === "CONVERSATION_NOT_FOUND") {
                res.status(404).json({ message: "Conversation not found" });
            }
            else {
                res.status(500).json({ message: "Failed to mark messages as seen" });
            }
        }
    },
    // Get online users
    getOnlineUsers: async (_req, res) => {
        try {
            const onlineUsers = await presence_service_1.presenceService.getOnlineUsers();
            res.status(200).json({ onlineUsers });
        }
        catch (err) {
            res.status(500).json({ message: "Failed to get online users" });
        }
    },
    // Get typing users in conversation
    getTypingUsers: async (req, res) => {
        try {
            const { conversationId } = req.params;
            const typingUsers = await presence_service_1.presenceService.getTypingUsers(String(conversationId));
            res.status(200).json({ conversationId, typingUsers });
        }
        catch (err) {
            res.status(500).json({ message: "Failed to get typing users" });
        }
    },
};
