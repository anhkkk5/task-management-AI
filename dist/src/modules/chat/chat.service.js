"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatService = void 0;
const mongoose_1 = require("mongoose");
const chat_repository_1 = require("./chat.repository");
const team_model_1 = require("../team/team.model");
const toPublicUser = (u) => ({
    id: String(u?._id || u?.id || u),
    name: u?.name || u?.fullName || "Unknown",
    avatar: u?.avatar,
    email: u?.email,
});
const toPublicConversation = (doc) => {
    const teamObj = doc.teamId;
    return {
        id: String(doc._id),
        type: doc.type,
        members: (doc.members || []).map((m) => typeof m === "object"
            ? toPublicUser(m)
            : { id: String(m), name: "Unknown" }),
        admins: (doc.admins || []).map((a) => String(a?._id || a)),
        createdBy: doc.createdBy
            ? String(doc.createdBy?._id || doc.createdBy)
            : undefined,
        taskId: doc.taskId
            ? {
                id: String(doc.taskId._id || doc.taskId),
                title: doc.taskId.title || "",
            }
            : undefined,
        teamId: teamObj && typeof teamObj === "object"
            ? {
                id: String(teamObj._id || teamObj.id),
                name: teamObj.name || "",
                avatar: teamObj.avatar,
            }
            : teamObj
                ? String(teamObj)
                : undefined,
        title: doc.title,
        avatar: doc.avatar,
        lastMessage: doc.lastMessage,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
};
const toPublicMessage = (doc) => {
    if (!doc)
        return doc;
    return {
        id: String(doc._id),
        conversationId: String(doc.conversationId),
        senderId: doc.senderId
            ? typeof doc.senderId === "object"
                ? toPublicUser(doc.senderId)
                : { id: String(doc.senderId), name: "Unknown" }
            : undefined,
        content: doc.content || "",
        type: doc.type,
        attachments: doc.attachments || [],
        reactions: (doc.reactions || []).map((r) => ({
            userId: String(r.userId?._id || r.userId),
            emoji: r.emoji,
            createdAt: r.createdAt,
        })),
        replyTo: doc.replyTo ? toPublicMessage(doc.replyTo) : null,
        editedAt: doc.editedAt,
        deletedAt: doc.deletedAt,
        call: doc.call,
        seenBy: (doc.seenBy || []).map((id) => String(id?._id || id)),
        createdAt: doc.createdAt,
    };
};
exports.chatService = {
    // ───────────── Conversation ─────────────
    createDirectConversation: async (userId1, userId2) => {
        if (String(userId1) === String(userId2)) {
            const err = new Error("Không thể tạo chat với chính mình");
            err.status = 400;
            throw err;
        }
        const id1 = new mongoose_1.Types.ObjectId(userId1);
        const id2 = new mongoose_1.Types.ObjectId(userId2);
        let conversation = await chat_repository_1.chatRepository.findDirectConversation(id1, id2);
        if (!conversation) {
            conversation = await chat_repository_1.chatRepository.createConversation({
                type: "direct",
                members: [id1, id2],
                createdBy: id1,
            });
            conversation =
                await chat_repository_1.chatRepository.findConversationByIdAndMemberPopulated(conversation._id, id1);
        }
        return toPublicConversation(conversation);
    },
    getOrCreateTeamConversation: async (teamId, userId) => {
        const team = await team_model_1.Team.findById(teamId);
        if (!team) {
            const err = new Error("Nhóm không tồn tại");
            err.status = 404;
            throw err;
        }
        const memberIds = (team.members || []).map((m) => new mongoose_1.Types.ObjectId(String(m.userId || m._id || m)));
        if (!memberIds.some((id) => String(id) === String(userId))) {
            const err = new Error("Bạn không thuộc nhóm này");
            err.status = 403;
            throw err;
        }
        let conversation = await chat_repository_1.chatRepository.findTeamConversation(new mongoose_1.Types.ObjectId(teamId));
        if (!conversation) {
            const created = await chat_repository_1.chatRepository.createConversation({
                type: "group",
                members: memberIds,
                admins: [new mongoose_1.Types.ObjectId(String(team.ownerId || userId))],
                createdBy: new mongoose_1.Types.ObjectId(userId),
                teamId: new mongoose_1.Types.ObjectId(teamId),
                title: team.name,
                avatar: team.avatar,
            });
            conversation = await chat_repository_1.chatRepository.findTeamConversation(new mongoose_1.Types.ObjectId(teamId));
            // fallback
            if (!conversation) {
                conversation =
                    await chat_repository_1.chatRepository.findConversationByIdAndMemberPopulated(created._id, new mongoose_1.Types.ObjectId(userId));
            }
        }
        else {
            // Sync members if team changed
            const teamMemberSet = new Set(memberIds.map((id) => String(id)));
            const convSet = new Set((conversation.members || []).map((m) => String(m._id || m)));
            const needSync = teamMemberSet.size !== convSet.size ||
                [...teamMemberSet].some((id) => !convSet.has(id));
            if (needSync) {
                await chat_repository_1.chatRepository.updateConversationMembers(conversation._id, memberIds);
                conversation = await chat_repository_1.chatRepository.findTeamConversation(new mongoose_1.Types.ObjectId(teamId));
            }
        }
        return toPublicConversation(conversation);
    },
    syncTeamConversationMembers: async (teamId) => {
        const team = await team_model_1.Team.findById(teamId);
        if (!team)
            return null;
        const conversation = await chat_repository_1.chatRepository.findTeamConversation(new mongoose_1.Types.ObjectId(teamId));
        if (!conversation)
            return null;
        const memberIds = (team.members || []).map((m) => new mongoose_1.Types.ObjectId(String(m.userId || m._id || m)));
        await chat_repository_1.chatRepository.updateConversationMembers(conversation._id, memberIds);
        return chat_repository_1.chatRepository.findTeamConversation(new mongoose_1.Types.ObjectId(teamId));
    },
    listUserConversations: async (userId, options = {}) => {
        const userObjId = new mongoose_1.Types.ObjectId(userId);
        const conversations = await chat_repository_1.chatRepository.listConversationsForUser(userObjId, options);
        const ids = conversations.map((c) => String(c._id));
        const unreadMap = await chat_repository_1.chatRepository.getUnreadCountBulk(ids, userObjId);
        return conversations.map((c) => {
            const p = toPublicConversation(c);
            p.unreadCount = unreadMap[String(c._id)] || 0;
            return p;
        });
    },
    getConversation: async (conversationId, userId) => {
        const conversation = await chat_repository_1.chatRepository.findConversationByIdAndMemberPopulated(conversationId, new mongoose_1.Types.ObjectId(userId));
        if (!conversation) {
            const err = new Error("Không tìm thấy cuộc trò chuyện");
            err.status = 404;
            throw err;
        }
        return toPublicConversation(conversation);
    },
    // ───────────── Messages ─────────────
    sendMessage: async (conversationId, senderId, payload) => {
        const conversation = await chat_repository_1.chatRepository.findConversationByIdAndMember(conversationId, new mongoose_1.Types.ObjectId(senderId));
        if (!conversation) {
            const err = new Error("Không tìm thấy cuộc trò chuyện");
            err.status = 404;
            throw err;
        }
        const attachments = payload.attachments || [];
        const content = String(payload.content ?? "").trim();
        if (!content && attachments.length === 0) {
            const err = new Error("Tin nhắn không được rỗng");
            err.status = 400;
            throw err;
        }
        const derivedType = payload.type ||
            (attachments.length
                ? attachments[0].kind === "image"
                    ? "image"
                    : attachments[0].kind === "video"
                        ? "video"
                        : "file"
                : "text");
        const created = await chat_repository_1.chatRepository.createMessage({
            conversationId: new mongoose_1.Types.ObjectId(conversationId),
            senderId: new mongoose_1.Types.ObjectId(senderId),
            content,
            type: derivedType,
            attachments,
            replyTo: payload.replyTo
                ? new mongoose_1.Types.ObjectId(payload.replyTo)
                : undefined,
            seenBy: [new mongoose_1.Types.ObjectId(senderId)],
        });
        // Preview text for last message
        const previewText = content
            ? content
            : attachments[0]?.kind === "image"
                ? "[Ảnh]"
                : attachments[0]?.kind === "video"
                    ? "[Video]"
                    : attachments[0]?.name
                        ? `[Tệp] ${attachments[0].name}`
                        : "[Tệp đính kèm]";
        await chat_repository_1.chatRepository.updateLastMessage(conversationId, {
            content: previewText,
            senderId: new mongoose_1.Types.ObjectId(senderId),
            createdAt: new Date(),
            type: derivedType,
        });
        const populated = await chat_repository_1.chatRepository.findMessagePopulated(created._id);
        return toPublicMessage(populated);
    },
    sendCallEventMessage: async (conversationId, senderId, call) => {
        const labelByStatus = {
            started: call.kind === "video" ? "📹 Cuộc gọi video" : "📞 Cuộc gọi thoại",
            ended: call.kind === "video"
                ? "📹 Cuộc gọi video đã kết thúc"
                : "📞 Cuộc gọi thoại đã kết thúc",
            missed: "⚠️ Cuộc gọi nhỡ",
            rejected: "🚫 Cuộc gọi bị từ chối",
        };
        const content = labelByStatus[call.status] || "Cuộc gọi";
        const created = await chat_repository_1.chatRepository.createMessage({
            conversationId: new mongoose_1.Types.ObjectId(conversationId),
            senderId: new mongoose_1.Types.ObjectId(senderId),
            content,
            type: "call",
            call,
            seenBy: [new mongoose_1.Types.ObjectId(senderId)],
        });
        await chat_repository_1.chatRepository.updateLastMessage(conversationId, {
            content,
            senderId: new mongoose_1.Types.ObjectId(senderId),
            createdAt: new Date(),
            type: "call",
        });
        const populated = await chat_repository_1.chatRepository.findMessagePopulated(created._id);
        return toPublicMessage(populated);
    },
    listMessages: async (conversationId, userId, options = {}) => {
        const conversation = await chat_repository_1.chatRepository.findConversationByIdAndMember(conversationId, new mongoose_1.Types.ObjectId(userId));
        if (!conversation) {
            const err = new Error("Không tìm thấy cuộc trò chuyện");
            err.status = 404;
            throw err;
        }
        const messages = await chat_repository_1.chatRepository.listMessagesByConversation(conversationId, options);
        return messages.reverse().map(toPublicMessage);
    },
    markAsSeen: async (messageId, userId) => {
        const updated = await chat_repository_1.chatRepository.markMessageAsSeen(messageId, new mongoose_1.Types.ObjectId(userId));
        if (!updated) {
            const err = new Error("Không tìm thấy tin nhắn");
            err.status = 404;
            throw err;
        }
        return toPublicMessage(updated);
    },
    markAllAsSeen: async (conversationId, userId) => {
        const conversation = await chat_repository_1.chatRepository.findConversationByIdAndMember(conversationId, new mongoose_1.Types.ObjectId(userId));
        if (!conversation) {
            const err = new Error("Không tìm thấy cuộc trò chuyện");
            err.status = 404;
            throw err;
        }
        await chat_repository_1.chatRepository.markAllMessagesAsSeen(conversationId, new mongoose_1.Types.ObjectId(userId));
    },
    getUnreadCount: async (conversationId, userId) => {
        return chat_repository_1.chatRepository.getUnreadCount(conversationId, new mongoose_1.Types.ObjectId(userId));
    },
    // Reactions
    toggleReaction: async (messageId, userId, emoji, action) => {
        const userObjId = new mongoose_1.Types.ObjectId(userId);
        const updated = action === "add"
            ? await chat_repository_1.chatRepository.addReaction(messageId, userObjId, emoji)
            : await chat_repository_1.chatRepository.removeReaction(messageId, userObjId, emoji);
        if (!updated) {
            const err = new Error("Không tìm thấy tin nhắn");
            err.status = 404;
            throw err;
        }
        return toPublicMessage(updated);
    },
    editMessage: async (messageId, userId, content) => {
        const msg = await chat_repository_1.chatRepository.findMessageById(messageId);
        if (!msg) {
            const err = new Error("Không tìm thấy tin nhắn");
            err.status = 404;
            throw err;
        }
        if (String(msg.senderId?._id || msg.senderId) !== String(userId)) {
            const err = new Error("Không có quyền sửa tin nhắn này");
            err.status = 403;
            throw err;
        }
        const updated = await chat_repository_1.chatRepository.editMessage(messageId, content);
        return toPublicMessage(updated);
    },
    deleteMessage: async (messageId, userId) => {
        const msg = await chat_repository_1.chatRepository.findMessageById(messageId);
        if (!msg) {
            const err = new Error("Không tìm thấy tin nhắn");
            err.status = 404;
            throw err;
        }
        if (String(msg.senderId?._id || msg.senderId) !== String(userId)) {
            const err = new Error("Không có quyền xóa tin nhắn này");
            err.status = 403;
            throw err;
        }
        const updated = await chat_repository_1.chatRepository.softDeleteMessage(messageId);
        return toPublicMessage(updated);
    },
};
