"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRepository = void 0;
const ai_conversation_model_1 = require("./ai-conversation.model");
const ai_message_model_1 = require("./ai-message.model");
const user_memory_model_1 = require("./user-memory.model");
exports.aiRepository = {
    createConversation: async (params) => {
        return ai_conversation_model_1.AiConversation.create({
            userId: params.userId,
            title: params.title,
            parentTaskId: params.parentTaskId,
            domain: params.domain,
        });
    },
    findConversationByParentTask: async (params) => {
        return ai_conversation_model_1.AiConversation.findOne({
            userId: params.userId,
            parentTaskId: params.parentTaskId,
        }).exec();
    },
    findOrCreateConversationForParentTask: async (params) => {
        const existing = await ai_conversation_model_1.AiConversation.findOne({
            userId: params.userId,
            parentTaskId: params.parentTaskId,
        }).exec();
        if (existing) {
            return { doc: existing, created: false };
        }
        const doc = await ai_conversation_model_1.AiConversation.create({
            userId: params.userId,
            parentTaskId: params.parentTaskId,
            title: params.title,
            domain: params.domain,
        });
        return { doc, created: true };
    },
    updateConversationContext: async (params) => {
        const set = {};
        if (params.lastSubtaskKey !== undefined) {
            set.lastSubtaskKey = params.lastSubtaskKey;
        }
        if (params.domain !== undefined) {
            set.domain = params.domain;
        }
        if (params.title !== undefined) {
            set.title = params.title;
        }
        if (params.context !== undefined) {
            set.context = params.context;
        }
        if (Object.keys(set).length === 0)
            return;
        await ai_conversation_model_1.AiConversation.updateOne({ _id: params.conversationId, userId: params.userId }, { $set: set }).exec();
    },
    listConversationsByUser: async (params) => {
        return ai_conversation_model_1.AiConversation.find({ userId: params.userId })
            .sort({ updatedAt: -1 })
            .limit(params.limit)
            .lean()
            .exec();
    },
    findConversationByIdForUser: async (params) => {
        return ai_conversation_model_1.AiConversation.findOne({
            _id: params.conversationId,
            userId: params.userId,
        }).exec();
    },
    touchConversationUpdatedAt: async (params) => {
        await ai_conversation_model_1.AiConversation.updateOne({ _id: params.conversationId, userId: params.userId }, { $set: { updatedAt: new Date() } }).exec();
    },
    createMessage: async (params) => {
        return ai_message_model_1.AiMessage.create({
            conversationId: params.conversationId,
            userId: params.userId,
            role: params.role,
            content: params.content,
            tokens: params.tokens,
            meta: params.meta,
        });
    },
    listMessagesByConversation: async (params) => {
        return ai_message_model_1.AiMessage.find({
            conversationId: params.conversationId,
            userId: params.userId,
        })
            .sort({ createdAt: 1 })
            .limit(params.limit)
            .lean()
            .exec();
    },
    deleteConversation: async (params) => {
        const result = await ai_conversation_model_1.AiConversation.deleteOne({
            _id: params.conversationId,
            userId: params.userId,
        }).exec();
        if (result.deletedCount > 0) {
            await ai_message_model_1.AiMessage.deleteMany({
                conversationId: params.conversationId,
            }).exec();
            return true;
        }
        return false;
    },
    renameConversation: async (params) => {
        return ai_conversation_model_1.AiConversation.findOneAndUpdate({ _id: params.conversationId, userId: params.userId }, { $set: { title: params.title } }, { new: true }).exec();
    },
    listUserMemories: async (params) => {
        const query = { userId: params.userId };
        if (params.scopes?.length)
            query.scope = { $in: params.scopes };
        if (params.domain)
            query.domain = params.domain;
        return user_memory_model_1.UserMemory.find(query)
            .sort({ lastSeenAt: -1, occurrences: -1 })
            .limit(params.limit ?? 30)
            .lean()
            .exec();
    },
    upsertUserMemory: async (params) => {
        const key = params.key.trim().toLowerCase();
        const value = params.value.trim();
        if (!key || !value)
            return null;
        return user_memory_model_1.UserMemory.findOneAndUpdate({ userId: params.userId, key, value }, {
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
        }, { new: true, upsert: true }).exec();
    },
};
