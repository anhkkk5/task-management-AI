"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const chat_controller_1 = require("./chat.controller");
const chatRouter = (0, express_1.Router)();
// Conversation routes
chatRouter.post("/conversations/direct", auth_middleware_1.authMiddleware, chat_controller_1.chatController.createDirectConversation);
chatRouter.post("/conversations/task", auth_middleware_1.authMiddleware, chat_controller_1.chatController.getOrCreateTaskConversation);
chatRouter.get("/conversations", auth_middleware_1.authMiddleware, chat_controller_1.chatController.listConversations);
chatRouter.get("/conversations/:conversationId", auth_middleware_1.authMiddleware, chat_controller_1.chatController.getConversation);
// Message routes
chatRouter.get("/conversations/:conversationId/messages", auth_middleware_1.authMiddleware, chat_controller_1.chatController.listMessages);
chatRouter.post("/conversations/:conversationId/messages", auth_middleware_1.authMiddleware, chat_controller_1.chatController.sendMessage);
chatRouter.post("/conversations/:conversationId/seen", auth_middleware_1.authMiddleware, chat_controller_1.chatController.markAllAsSeen);
// Presence routes
chatRouter.get("/presence/online", auth_middleware_1.authMiddleware, chat_controller_1.chatController.getOnlineUsers);
chatRouter.get("/conversations/:conversationId/typing", auth_middleware_1.authMiddleware, chat_controller_1.chatController.getTypingUsers);
exports.default = chatRouter;
