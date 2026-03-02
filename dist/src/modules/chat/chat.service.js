"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatService = void 0;
const mongoose_1 = require("mongoose");
const chat_repository_1 = require("./chat.repository");
const toPublicConversation = (doc) => {
    return {
        id: String(doc._id),
        type: doc.type,
        members: (doc.members || []).map((m) => ({
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
const toPublicMessage = (doc) => {
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
        seenBy: (doc.seenBy || []).map((id) => String(id)),
        createdAt: doc.createdAt,
    };
};
exports.chatService = {
    // Conversation services
    createDirectConversation: async (userId1, userId2) => {
        const id1 = new mongoose_1.Types.ObjectId(userId1);
        const id2 = new mongoose_1.Types.ObjectId(userId2);
        // Check if conversation already exists
        let conversation = await chat_repository_1.chatRepository.findDirectConversation(id1, id2);
        if (conversation) {
            return toPublicConversation(conversation);
        }
        conversation = await chat_repository_1.chatRepository.createConversation({
            type: "direct",
            members: [id1, id2],
        });
        return toPublicConversation(conversation);
    },
    getOrCreateTaskConversation: async (taskId, members) => {
        const taskObjectId = new mongoose_1.Types.ObjectId(taskId);
        const memberIds = members.map((id) => new mongoose_1.Types.ObjectId(id));
        let conversation = await chat_repository_1.chatRepository.findTaskConversation(taskObjectId);
        if (conversation) {
            return toPublicConversation(conversation);
        }
        conversation = await chat_repository_1.chatRepository.createConversation({
            type: "task",
            taskId: taskObjectId,
            members: memberIds,
        });
        return toPublicConversation(conversation);
    },
    listUserConversations: async (userId, options) => {
        const conversations = await chat_repository_1.chatRepository.listConversationsForUser(new mongoose_1.Types.ObjectId(userId), options);
        return conversations.map(toPublicConversation);
    },
    getConversation: async (conversationId, userId) => {
        const conversation = await chat_repository_1.chatRepository.findConversationByIdAndMember(conversationId, new mongoose_1.Types.ObjectId(userId));
        if (!conversation) {
            throw new Error("CONVERSATION_NOT_FOUND");
        }
        return toPublicConversation(conversation);
    },
    // Message services
    sendMessage: async (conversationId, senderId, content, type = "text") => {
        // Verify user is member of conversation
        const conversation = await chat_repository_1.chatRepository.findConversationByIdAndMember(conversationId, new mongoose_1.Types.ObjectId(senderId));
        if (!conversation) {
            throw new Error("CONVERSATION_NOT_FOUND");
        }
        const message = await chat_repository_1.chatRepository.createMessage({
            conversationId: new mongoose_1.Types.ObjectId(conversationId),
            senderId: new mongoose_1.Types.ObjectId(senderId),
            content,
            type,
            seenBy: [new mongoose_1.Types.ObjectId(senderId)],
        });
        // Update last message in conversation
        await chat_repository_1.chatRepository.updateLastMessage(conversationId, {
            content,
            senderId: new mongoose_1.Types.ObjectId(senderId),
            createdAt: new Date(),
        });
        return toPublicMessage(message);
    },
    listMessages: async (conversationId, userId, options = {}) => {
        // Verify user is member
        const conversation = await chat_repository_1.chatRepository.findConversationByIdAndMember(conversationId, new mongoose_1.Types.ObjectId(userId));
        if (!conversation) {
            throw new Error("CONVERSATION_NOT_FOUND");
        }
        const messages = await chat_repository_1.chatRepository.listMessagesByConversation(conversationId, options);
        return messages.map(toPublicMessage);
    },
    markAsSeen: async (messageId, userId) => {
        const updated = await chat_repository_1.chatRepository.markMessageAsSeen(messageId, new mongoose_1.Types.ObjectId(userId));
        if (!updated) {
            throw new Error("MESSAGE_NOT_FOUND");
        }
        return toPublicMessage(updated);
    },
    markAllAsSeen: async (conversationId, userId) => {
        // Verify user is member
        const conversation = await chat_repository_1.chatRepository.findConversationByIdAndMember(conversationId, new mongoose_1.Types.ObjectId(userId));
        if (!conversation) {
            throw new Error("CONVERSATION_NOT_FOUND");
        }
        await chat_repository_1.chatRepository.markAllMessagesAsSeen(conversationId, new mongoose_1.Types.ObjectId(userId));
    },
    getUnreadCount: async (conversationId, userId) => {
        return chat_repository_1.chatRepository.getUnreadCount(conversationId, new mongoose_1.Types.ObjectId(userId));
    },
};
