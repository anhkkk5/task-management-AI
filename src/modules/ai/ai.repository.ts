import { Types } from "mongoose";
import { AiConversation, AiConversationDoc } from "./ai-conversation.model";
import {
  AiMessage,
  AiMessageDoc,
  AiMessageMeta,
  AiMessageRole,
} from "./ai-message.model";
import {
  UserMemory,
  UserMemoryDoc,
  UserMemoryScope,
} from "./user-memory.model";

export const aiRepository = {
  createConversation: async (params: {
    userId: Types.ObjectId;
    title: string;
    parentTaskId?: Types.ObjectId;
    domain?: string;
  }): Promise<AiConversationDoc> => {
    return AiConversation.create({
      userId: params.userId,
      title: params.title,
      parentTaskId: params.parentTaskId,
      domain: params.domain,
    });
  },

  findConversationByParentTask: async (params: {
    userId: Types.ObjectId;
    parentTaskId: Types.ObjectId;
  }): Promise<AiConversationDoc | null> => {
    return AiConversation.findOne({
      userId: params.userId,
      parentTaskId: params.parentTaskId,
    }).exec();
  },

  findOrCreateConversationForParentTask: async (params: {
    userId: Types.ObjectId;
    parentTaskId: Types.ObjectId;
    title: string;
    domain?: string;
  }): Promise<{ doc: AiConversationDoc; created: boolean }> => {
    const existing = await AiConversation.findOne({
      userId: params.userId,
      parentTaskId: params.parentTaskId,
    }).exec();
    if (existing) {
      return { doc: existing, created: false };
    }
    const doc = await AiConversation.create({
      userId: params.userId,
      parentTaskId: params.parentTaskId,
      title: params.title,
      domain: params.domain,
    });
    return { doc, created: true };
  },

  updateConversationContext: async (params: {
    conversationId: Types.ObjectId;
    userId: Types.ObjectId;
    lastSubtaskKey?: string;
    domain?: string;
    title?: string;
  }): Promise<void> => {
    const set: Record<string, unknown> = {};
    if (params.lastSubtaskKey !== undefined) {
      set.lastSubtaskKey = params.lastSubtaskKey;
    }
    if (params.domain !== undefined) {
      set.domain = params.domain;
    }
    if (params.title !== undefined) {
      set.title = params.title;
    }
    if (Object.keys(set).length === 0) return;
    await AiConversation.updateOne(
      { _id: params.conversationId, userId: params.userId },
      { $set: set },
    ).exec();
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
    meta?: AiMessageMeta;
  }): Promise<AiMessageDoc> => {
    return AiMessage.create({
      conversationId: params.conversationId,
      userId: params.userId,
      role: params.role,
      content: params.content,
      tokens: params.tokens,
      meta: params.meta,
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

  deleteConversation: async (params: {
    conversationId: Types.ObjectId;
    userId: Types.ObjectId;
  }): Promise<boolean> => {
    const result = await AiConversation.deleteOne({
      _id: params.conversationId,
      userId: params.userId,
    }).exec();
    if (result.deletedCount > 0) {
      await AiMessage.deleteMany({
        conversationId: params.conversationId,
      }).exec();
      return true;
    }
    return false;
  },

  renameConversation: async (params: {
    conversationId: Types.ObjectId;
    userId: Types.ObjectId;
    title: string;
  }): Promise<AiConversationDoc | null> => {
    return AiConversation.findOneAndUpdate(
      { _id: params.conversationId, userId: params.userId },
      { $set: { title: params.title } },
      { new: true },
    ).exec();
  },

  // ─────────────────── User Memory ───────────────────
  listUserMemories: async (params: {
    userId: Types.ObjectId;
    scopes?: UserMemoryScope[];
    domain?: string;
    limit?: number;
  }): Promise<UserMemoryDoc[]> => {
    const query: Record<string, unknown> = { userId: params.userId };
    if (params.scopes?.length) query.scope = { $in: params.scopes };
    if (params.domain) query.domain = params.domain;
    return UserMemory.find(query)
      .sort({ lastSeenAt: -1, occurrences: -1 })
      .limit(params.limit ?? 30)
      .exec();
  },

  upsertUserMemory: async (params: {
    userId: Types.ObjectId;
    scope: UserMemoryScope;
    key: string;
    value: string;
    domain?: string;
    confidence?: number;
  }): Promise<UserMemoryDoc | null> => {
    const key = params.key.trim().toLowerCase();
    const value = params.value.trim();
    if (!key || !value) return null;
    return UserMemory.findOneAndUpdate(
      { userId: params.userId, key, value },
      {
        $setOnInsert: {
          userId: params.userId,
          scope: params.scope,
          key,
          value,
          domain: params.domain,
        },
        $set: {
          lastSeenAt: new Date(),
          ...(params.confidence !== undefined
            ? { confidence: params.confidence }
            : {}),
        },
        $inc: { occurrences: 1 },
      },
      { new: true, upsert: true },
    ).exec();
  },
};
