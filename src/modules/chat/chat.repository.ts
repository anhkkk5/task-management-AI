import { Types } from "mongoose";
import { ConversationModel, IConversation } from "./chat.model";
import { MessageModel, IMessage } from "./message.model";

export const chatRepository = {
  // Conversation operations
  createConversation: async (
    data: Omit<IConversation, "createdAt" | "updatedAt">,
  ) => {
    return ConversationModel.create(data);
  },

  findConversationById: async (conversationId: string | Types.ObjectId) => {
    return ConversationModel.findById(conversationId);
  },

  findConversationByIdAndMember: async (
    conversationId: string | Types.ObjectId,
    userId: Types.ObjectId,
  ) => {
    return ConversationModel.findOne({
      _id: conversationId,
      members: { $in: [userId] },
    });
  },

  findDirectConversation: async (userId1: Types.ObjectId, userId2: Types.ObjectId) => {
    return ConversationModel.findOne({
      type: "direct",
      members: { $all: [userId1, userId2], $size: 2 },
    });
  },

  findTaskConversation: async (taskId: Types.ObjectId) => {
    return ConversationModel.findOne({
      type: "task",
      taskId,
    });
  },

  listConversationsForUser: async (
    userId: Types.ObjectId,
    options: { limit?: number; offset?: number } = {},
  ) => {
    const { limit = 20, offset = 0 } = options;
    return ConversationModel.find({ members: { $in: [userId] } })
      .sort({ updatedAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate("members", "_id fullName avatar")
      .populate("taskId", "_id title");
  },

  updateLastMessage: async (
    conversationId: string | Types.ObjectId,
    lastMessage: { content: string; senderId: Types.ObjectId; createdAt: Date },
  ) => {
    return ConversationModel.findByIdAndUpdate(
      conversationId,
      { lastMessage, updatedAt: new Date() },
      { new: true },
    );
  },

  // Message operations
  createMessage: async (data: Omit<IMessage, "createdAt" | "updatedAt">) => {
    return MessageModel.create(data);
  },

  findMessageById: async (messageId: string | Types.ObjectId) => {
    return MessageModel.findById(messageId).populate("senderId", "_id fullName avatar");
  },

  listMessagesByConversation: async (
    conversationId: string | Types.ObjectId,
    options: { limit?: number; offset?: number } = {},
  ) => {
    const { limit = 50, offset = 0 } = options;
    return MessageModel.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate("senderId", "_id fullName avatar")
      .lean();
  },

  markMessageAsSeen: async (
    messageId: string | Types.ObjectId,
    userId: Types.ObjectId,
  ) => {
    return MessageModel.findByIdAndUpdate(
      messageId,
      { $addToSet: { seenBy: userId } },
      { new: true },
    );
  },

  markAllMessagesAsSeen: async (
    conversationId: string | Types.ObjectId,
    userId: Types.ObjectId,
  ) => {
    return MessageModel.updateMany(
      { conversationId, senderId: { $ne: userId }, seenBy: { $nin: [userId] } },
      { $addToSet: { seenBy: userId } },
    );
  },

  getUnreadCount: async (conversationId: string | Types.ObjectId, userId: Types.ObjectId) => {
    return MessageModel.countDocuments({
      conversationId,
      senderId: { $ne: userId },
      seenBy: { $nin: [userId] },
    });
  },
};
