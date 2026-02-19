import { Request, Response } from "express";
import { chatService } from "./chat.service";
import { presenceService } from "./presence.service";

export const chatController = {
  // Create or get direct conversation
  createDirectConversation: async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { userId: otherUserId } = req.body;
      if (!otherUserId) {
        res.status(400).json({ message: "userId is required" });
        return;
      }

      const conversation = await chatService.createDirectConversation(
        userId,
        otherUserId,
      );
      res.status(200).json({ conversation });
    } catch (err) {
      res.status(500).json({ message: "Failed to create conversation" });
    }
  },

  // Get or create task conversation
  getOrCreateTaskConversation: async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { taskId, members } = req.body;
      if (!taskId || !members || !Array.isArray(members)) {
        res.status(400).json({ message: "taskId and members are required" });
        return;
      }

      const conversation = await chatService.getOrCreateTaskConversation(
        taskId,
        members,
      );
      res.status(200).json({ conversation });
    } catch (err) {
      res
        .status(500)
        .json({ message: "Failed to get/create task conversation" });
    }
  },

  // List user's conversations
  listConversations: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const conversations = await chatService.listUserConversations(userId, {
        limit,
        offset,
      });
      res.status(200).json({ conversations });
    } catch (err) {
      res.status(500).json({ message: "Failed to list conversations" });
    }
  },

  // Get conversation details
  getConversation: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { conversationId } = req.params;
      const conversation = await chatService.getConversation(
        String(conversationId),
        userId,
      );
      res.status(200).json({ conversation });
    } catch (err: any) {
      if (err.message === "CONVERSATION_NOT_FOUND") {
        res.status(404).json({ message: "Conversation not found" });
      } else {
        res.status(500).json({ message: "Failed to get conversation" });
      }
    }
  },

  // Send message via REST (fallback for non-socket clients)
  sendMessage: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
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

      const message = await chatService.sendMessage(
        String(conversationId),
        userId,
        content,
        type || "text",
      );
      res.status(201).json({ message });
    } catch (err: any) {
      if (err.message === "CONVERSATION_NOT_FOUND") {
        res.status(404).json({ message: "Conversation not found" });
      } else {
        res.status(500).json({ message: "Failed to send message" });
      }
    }
  },

  // List messages
  listMessages: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { conversationId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const messages = await chatService.listMessages(
        String(conversationId),
        userId,
        { limit, offset },
      );
      res.status(200).json({ messages });
    } catch (err: any) {
      if (err.message === "CONVERSATION_NOT_FOUND") {
        res.status(404).json({ message: "Conversation not found" });
      } else {
        res.status(500).json({ message: "Failed to list messages" });
      }
    }
  },

  // Mark all messages as seen
  markAllAsSeen: async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user?.userId;
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const { conversationId } = req.params;
      await chatService.markAllAsSeen(String(conversationId), userId);
      res.status(200).json({ message: "All messages marked as seen" });
    } catch (err: any) {
      if (err.message === "CONVERSATION_NOT_FOUND") {
        res.status(404).json({ message: "Conversation not found" });
      } else {
        res.status(500).json({ message: "Failed to mark messages as seen" });
      }
    }
  },

  // Get online users
  getOnlineUsers: async (_req: Request, res: Response): Promise<void> => {
    try {
      const onlineUsers = await presenceService.getOnlineUsers();
      res.status(200).json({ onlineUsers });
    } catch (err) {
      res.status(500).json({ message: "Failed to get online users" });
    }
  },

  // Get typing users in conversation
  getTypingUsers: async (req: Request, res: Response): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const typingUsers = await presenceService.getTypingUsers(
        String(conversationId),
      );
      res.status(200).json({ conversationId, typingUsers });
    } catch (err) {
      res.status(500).json({ message: "Failed to get typing users" });
    }
  },
};
