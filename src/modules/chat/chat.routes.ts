import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import multer from "multer";
import { chatController } from "./chat.controller";

const chatRouter = Router();

// 25MB limit for chat attachments
const uploadChat = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// User search (for starting new chats)
chatRouter.get("/users/search", authMiddleware, chatController.searchUsers);

// Conversation routes
chatRouter.post(
  "/conversations/direct",
  authMiddleware,
  chatController.createDirectConversation,
);
chatRouter.post(
  "/conversations/team",
  authMiddleware,
  chatController.getOrCreateTeamConversation,
);
chatRouter.get(
  "/conversations",
  authMiddleware,
  chatController.listConversations,
);
chatRouter.get(
  "/conversations/:conversationId",
  authMiddleware,
  chatController.getConversation,
);

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

// Attachment upload
chatRouter.post(
  "/uploads",
  authMiddleware,
  uploadChat.single("file"),
  chatController.uploadAttachment,
);

// Message mutations
chatRouter.post(
  "/messages/:messageId/react",
  authMiddleware,
  chatController.reactMessage,
);
chatRouter.patch(
  "/messages/:messageId",
  authMiddleware,
  chatController.editMessage,
);
chatRouter.delete(
  "/messages/:messageId",
  authMiddleware,
  chatController.deleteMessage,
);

// Presence routes
chatRouter.get(
  "/presence/online",
  authMiddleware,
  chatController.getOnlineUsers,
);
chatRouter.get(
  "/conversations/:conversationId/typing",
  authMiddleware,
  chatController.getTypingUsers,
);

export default chatRouter;
