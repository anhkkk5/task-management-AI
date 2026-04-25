"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const multer_1 = __importDefault(require("multer"));
const chat_controller_1 = require("./chat.controller");
const chatRouter = (0, express_1.Router)();
// 25MB limit for chat attachments
const uploadChat = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
});
// User search (for starting new chats)
chatRouter.get("/users/search", auth_middleware_1.authMiddleware, chat_controller_1.chatController.searchUsers);
// Conversation routes
chatRouter.post("/conversations/direct", auth_middleware_1.authMiddleware, chat_controller_1.chatController.createDirectConversation);
chatRouter.post("/conversations/team", auth_middleware_1.authMiddleware, chat_controller_1.chatController.getOrCreateTeamConversation);
chatRouter.get("/conversations", auth_middleware_1.authMiddleware, chat_controller_1.chatController.listConversations);
chatRouter.get("/conversations/:conversationId", auth_middleware_1.authMiddleware, chat_controller_1.chatController.getConversation);
// Message routes
chatRouter.get("/conversations/:conversationId/messages", auth_middleware_1.authMiddleware, chat_controller_1.chatController.listMessages);
chatRouter.post("/conversations/:conversationId/messages", auth_middleware_1.authMiddleware, chat_controller_1.chatController.sendMessage);
chatRouter.post("/conversations/:conversationId/seen", auth_middleware_1.authMiddleware, chat_controller_1.chatController.markAllAsSeen);
// Attachment upload
chatRouter.post("/uploads", auth_middleware_1.authMiddleware, uploadChat.single("file"), chat_controller_1.chatController.uploadAttachment);
// Message mutations
chatRouter.post("/messages/:messageId/react", auth_middleware_1.authMiddleware, chat_controller_1.chatController.reactMessage);
chatRouter.patch("/messages/:messageId", auth_middleware_1.authMiddleware, chat_controller_1.chatController.editMessage);
chatRouter.delete("/messages/:messageId", auth_middleware_1.authMiddleware, chat_controller_1.chatController.deleteMessage);
// Presence routes
chatRouter.get("/presence/online", auth_middleware_1.authMiddleware, chat_controller_1.chatController.getOnlineUsers);
chatRouter.get("/conversations/:conversationId/typing", auth_middleware_1.authMiddleware, chat_controller_1.chatController.getTypingUsers);
exports.default = chatRouter;
