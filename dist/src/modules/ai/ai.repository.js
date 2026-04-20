"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRepository = void 0;
const ai_conversation_model_1 = require("./ai-conversation.model");
const ai_message_model_1 = require("./ai-message.model");
exports.aiRepository = {
    createConversation: async (params) => {
        return ai_conversation_model_1.AiConversation.create({
            userId: params.userId,
            title: params.title,
        });
    },
    listConversationsByUser: async (params) => {
        return ai_conversation_model_1.AiConversation.find({ userId: params.userId })
            .sort({ updatedAt: -1 })
            .limit(params.limit)
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
        });
    },
    listMessagesByConversation: async (params) => {
        return ai_message_model_1.AiMessage.find({
            conversationId: params.conversationId,
            userId: params.userId,
        })
            .sort({ createdAt: 1 })
            .limit(params.limit)
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
};
