"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatRepository = void 0;
const chat_model_1 = require("./chat.model");
const message_model_1 = require("./message.model");
exports.chatRepository = {
    // Conversation operations
    createConversation: async (data) => {
        return chat_model_1.ConversationModel.create(data);
    },
    findConversationById: async (conversationId) => {
        return chat_model_1.ConversationModel.findById(conversationId);
    },
    findConversationByIdAndMember: async (conversationId, userId) => {
        return chat_model_1.ConversationModel.findOne({
            _id: conversationId,
            members: { $in: [userId] },
        });
    },
    findDirectConversation: async (userId1, userId2) => {
        return chat_model_1.ConversationModel.findOne({
            type: "direct",
            members: { $all: [userId1, userId2], $size: 2 },
        });
    },
    findTaskConversation: async (taskId) => {
        return chat_model_1.ConversationModel.findOne({
            type: "task",
            taskId,
        });
    },
    listConversationsForUser: async (userId, options = {}) => {
        const { limit = 20, offset = 0 } = options;
        return chat_model_1.ConversationModel.find({ members: { $in: [userId] } })
            .sort({ updatedAt: -1 })
            .skip(offset)
            .limit(limit)
            .populate("members", "_id fullName avatar")
            .populate("taskId", "_id title");
    },
    updateLastMessage: async (conversationId, lastMessage) => {
        return chat_model_1.ConversationModel.findByIdAndUpdate(conversationId, { lastMessage, updatedAt: new Date() }, { new: true });
    },
    // Message operations
    createMessage: async (data) => {
        return message_model_1.MessageModel.create(data);
    },
    findMessageById: async (messageId) => {
        return message_model_1.MessageModel.findById(messageId).populate("senderId", "_id fullName avatar");
    },
    listMessagesByConversation: async (conversationId, options = {}) => {
        const { limit = 50, offset = 0 } = options;
        return message_model_1.MessageModel.find({ conversationId })
            .sort({ createdAt: -1 })
            .skip(offset)
            .limit(limit)
            .populate("senderId", "_id fullName avatar")
            .lean();
    },
    markMessageAsSeen: async (messageId, userId) => {
        return message_model_1.MessageModel.findByIdAndUpdate(messageId, { $addToSet: { seenBy: userId } }, { new: true });
    },
    markAllMessagesAsSeen: async (conversationId, userId) => {
        return message_model_1.MessageModel.updateMany({ conversationId, senderId: { $ne: userId }, seenBy: { $nin: [userId] } }, { $addToSet: { seenBy: userId } });
    },
    getUnreadCount: async (conversationId, userId) => {
        return message_model_1.MessageModel.countDocuments({
            conversationId,
            senderId: { $ne: userId },
            seenBy: { $nin: [userId] },
        });
    },
};
