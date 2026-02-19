import { Types } from "mongoose";
import { chatRepository } from "./chat.repository";
import { IConversation, ConversationDoc } from "./chat.model";
import { IMessage, MessageDoc } from "./message.model";

export type PublicConversation = {
  id: string;
  type: "direct" | "group" | "task";
  members: { id: string; fullName: string; avatar?: string }[];
  taskId?: { id: string; title: string };
  title?: string;
  lastMessage?: {
    content: string;
    senderId: string;
    createdAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
};

export type PublicMessage = {
  id: string;
  conversationId: string;
  senderId?: { id: string; fullName: string; avatar?: string };
  content: string;
  type: "text" | "ai" | "system";
  seenBy: string[];
  createdAt: Date;
};

const toPublicConversation = (doc: any): PublicConversation => {
  return {
    id: String(doc._id),
    type: doc.type,
    members: (doc.members || []).map((m: any) => ({
      id: String(m._id || m),
      fullName: m.fullName || "Unknown",
      avatar: m.avatar,
    })),
    taskId: doc.taskId
      ? {
          id: String(doc.taskId._id || doc.taskId),
          title: doc.taskId.title || "",
        }
      : undefined,
    title: doc.title,
    lastMessage: doc.lastMessage,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

const toPublicMessage = (doc: any): PublicMessage => {
  return {
    id: String(doc._id),
    conversationId: String(doc.conversationId),
    senderId: doc.senderId
      ? {
          id: String(doc.senderId._id || doc.senderId),
          fullName: doc.senderId.fullName || "Unknown",
          avatar: doc.senderId.avatar,
        }
      : undefined,
    content: doc.content,
    type: doc.type,
    seenBy: (doc.seenBy || []).map((id: any) => String(id)),
    createdAt: doc.createdAt,
  };
};

export const chatService = {
  // Conversation services
  createDirectConversation: async (userId1: string, userId2: string) => {
    const id1 = new Types.ObjectId(userId1);
    const id2 = new Types.ObjectId(userId2);

    // Check if conversation already exists
    let conversation = await chatRepository.findDirectConversation(id1, id2);
    if (conversation) {
      return toPublicConversation(conversation);
    }

    conversation = await chatRepository.createConversation({
      type: "direct",
      members: [id1, id2],
    });

    return toPublicConversation(conversation);
  },

  getOrCreateTaskConversation: async (taskId: string, members: string[]) => {
    const taskObjectId = new Types.ObjectId(taskId);
    const memberIds = members.map((id) => new Types.ObjectId(id));

    let conversation = await chatRepository.findTaskConversation(taskObjectId);
    if (conversation) {
      return toPublicConversation(conversation);
    }

    conversation = await chatRepository.createConversation({
      type: "task",
      taskId: taskObjectId,
      members: memberIds,
    });

    return toPublicConversation(conversation);
  },

  listUserConversations: async (userId: string, options: { limit?: number; offset?: number }) => {
    const conversations = await chatRepository.listConversationsForUser(
      new Types.ObjectId(userId),
      options,
    );
    return conversations.map(toPublicConversation);
  },

  getConversation: async (conversationId: string, userId: string) => {
    const conversation = await chatRepository.findConversationByIdAndMember(
      conversationId,
      new Types.ObjectId(userId),
    );
    if (!conversation) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }
    return toPublicConversation(conversation);
  },

  // Message services
  sendMessage: async (
    conversationId: string,
    senderId: string,
    content: string,
    type: "text" | "ai" | "system" = "text",
  ) => {
    // Verify user is member of conversation
    const conversation = await chatRepository.findConversationByIdAndMember(
      conversationId,
      new Types.ObjectId(senderId),
    );
    if (!conversation) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }

    const message = await chatRepository.createMessage({
      conversationId: new Types.ObjectId(conversationId),
      senderId: new Types.ObjectId(senderId),
      content,
      type,
      seenBy: [new Types.ObjectId(senderId)],
    });

    // Update last message in conversation
    await chatRepository.updateLastMessage(conversationId, {
      content,
      senderId: new Types.ObjectId(senderId),
      createdAt: new Date(),
    });

    return toPublicMessage(message);
  },

  listMessages: async (
    conversationId: string,
    userId: string,
    options: { limit?: number; offset?: number } = {},
  ) => {
    // Verify user is member
    const conversation = await chatRepository.findConversationByIdAndMember(
      conversationId,
      new Types.ObjectId(userId),
    );
    if (!conversation) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }

    const messages = await chatRepository.listMessagesByConversation(conversationId, options);
    return messages.map(toPublicMessage);
  },

  markAsSeen: async (messageId: string, userId: string) => {
    const updated = await chatRepository.markMessageAsSeen(
      messageId,
      new Types.ObjectId(userId),
    );
    if (!updated) {
      throw new Error("MESSAGE_NOT_FOUND");
    }
    return toPublicMessage(updated);
  },

  markAllAsSeen: async (conversationId: string, userId: string) => {
    // Verify user is member
    const conversation = await chatRepository.findConversationByIdAndMember(
      conversationId,
      new Types.ObjectId(userId),
    );
    if (!conversation) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }

    await chatRepository.markAllMessagesAsSeen(conversationId, new Types.ObjectId(userId));
  },

  getUnreadCount: async (conversationId: string, userId: string) => {
    return chatRepository.getUnreadCount(conversationId, new Types.ObjectId(userId));
  },
};
