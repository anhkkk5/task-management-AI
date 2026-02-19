import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { chatController } from "./chat.controller";

const chatRouter = Router();

// Conversation routes
chatRouter.post("/conversations/direct", authMiddleware, chatController.createDirectConversation);

chatRouter.post(
  "/conversations/task",
  authMiddleware,
  chatController.getOrCreateTaskConversation,
);

chatRouter.get("/conversations", authMiddleware, chatController.listConversations);

chatRouter.get("/conversations/:conversationId", authMiddleware, chatController.getConversation);

// Message routes
chatRouter.get(
  "/conversations/:conversationId/messages",
  authMiddleware,
  chatController.listMessages,
);

chatRouter.post(
  "/conversations/:conversationId/messages",
  authMiddleware,
  chatController.sendMessage,
);

chatRouter.post(
  "/conversations/:conversationId/seen",
  authMiddleware,
  chatController.markAllAsSeen,
);

// Presence routes
chatRouter.get("/presence/online", authMiddleware, chatController.getOnlineUsers);

chatRouter.get(
  "/conversations/:conversationId/typing",
  authMiddleware,
  chatController.getTypingUsers,
);

export default chatRouter;
