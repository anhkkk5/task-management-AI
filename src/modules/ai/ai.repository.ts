import { Types } from "mongoose";
import { AiConversation, AiConversationDoc } from "./ai-conversation.model";
import { AiMessage, AiMessageDoc, AiMessageRole } from "./ai-message.model";

export const aiRepository = {
  createConversation: async (params: {
    userId: Types.ObjectId;
    title: string;
  }): Promise<AiConversationDoc> => {
    return AiConversation.create({ userId: params.userId, title: params.title });
  },

  listConversationsByUser: async (params: {
    userId: Types.ObjectId;
    limit: number;
  }): Promise<AiConversationDoc[]> => {
    return AiConversation.find({ userId: params.userId })
      .sort({ updatedAt: -1 })
      .limit(params.limit)
      .exec();
  },

  findConversationByIdForUser: async (params: {
    conversationId: Types.ObjectId;
    userId: Types.ObjectId;
  }): Promise<AiConversationDoc | null> => {
    return AiConversation.findOne({
      _id: params.conversationId,
      userId: params.userId,
    }).exec();
  },

  touchConversationUpdatedAt: async (params: {
    conversationId: Types.ObjectId;
    userId: Types.ObjectId;
  }): Promise<void> => {
    await AiConversation.updateOne(
      { _id: params.conversationId, userId: params.userId },
      { $set: { updatedAt: new Date() } },
    ).exec();
  },

  createMessage: async (params: {
    conversationId: Types.ObjectId;
    userId: Types.ObjectId;
    role: AiMessageRole;
    content: string;
    tokens?: number;
  }): Promise<AiMessageDoc> => {
    return AiMessage.create({
      conversationId: params.conversationId,
      userId: params.userId,
      role: params.role,
      content: params.content,
      tokens: params.tokens,
    });
  },

  listMessagesByConversation: async (params: {
    conversationId: Types.ObjectId;
    userId: Types.ObjectId;
    limit: number;
  }): Promise<AiMessageDoc[]> => {
    return AiMessage.find({
      conversationId: params.conversationId,
      userId: params.userId,
    })
      .sort({ createdAt: 1 })
      .limit(params.limit)
      .exec();
  },
};
