import { Types } from "mongoose";
import { chatRepository } from "./chat.repository";
import { Team as TeamModel } from "../team/team.model";
import type { IAttachment, ICallMeta } from "./message.model";

export type PublicUser = {
  id: string;
  name: string;
  avatar?: string;
  email?: string;
};

export type PublicConversation = {
  id: string;
  type: "direct" | "group" | "task";
  members: PublicUser[];
  admins?: string[];
  createdBy?: string;
  taskId?: { id: string; title: string };
  teamId?: { id: string; name: string; avatar?: string } | string;
  title?: string;
  avatar?: string;
  lastMessage?: {
    content: string;
    senderId: string;
    createdAt: Date;
    type?: string;
  };
  unreadCount?: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicMessage = {
  id: string;
  conversationId: string;
  senderId?: PublicUser;
  content: string;
  type: string;
  attachments?: IAttachment[];
  reactions?: { userId: string; emoji: string; createdAt: Date }[];
  replyTo?: PublicMessage | null;
  editedAt?: Date;
  deletedAt?: Date;
  call?: ICallMeta;
  seenBy: string[];
  createdAt: Date;
};

const toPublicUser = (u: any): PublicUser => ({
  id: String(u?._id || u?.id || u),
  name: u?.name || u?.fullName || "Unknown",
  avatar: u?.avatar,
  email: u?.email,
});

const toPublicConversation = (doc: any): PublicConversation => {
  const teamObj = doc.teamId;
  return {
    id: String(doc._id),
    type: doc.type,
    members: (doc.members || []).map((m: any) =>
      typeof m === "object"
        ? toPublicUser(m)
        : { id: String(m), name: "Unknown" },
    ),
    admins: (doc.admins || []).map((a: any) => String(a?._id || a)),
    createdBy: doc.createdBy
      ? String(doc.createdBy?._id || doc.createdBy)
      : undefined,
    taskId: doc.taskId
      ? {
          id: String(doc.taskId._id || doc.taskId),
          title: doc.taskId.title || "",
        }
      : undefined,
    teamId:
      teamObj && typeof teamObj === "object"
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

const toPublicMessage = (doc: any): PublicMessage => {
  if (!doc) return doc;
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
    reactions: (doc.reactions || []).map((r: any) => ({
      userId: String(r.userId?._id || r.userId),
      emoji: r.emoji,
      createdAt: r.createdAt,
    })),
    replyTo: doc.replyTo ? toPublicMessage(doc.replyTo) : null,
    editedAt: doc.editedAt,
    deletedAt: doc.deletedAt,
    call: doc.call,
    seenBy: (doc.seenBy || []).map((id: any) => String(id?._id || id)),
    createdAt: doc.createdAt,
  };
};

export const chatService = {
  // ───────────── Conversation ─────────────
  createDirectConversation: async (userId1: string, userId2: string) => {
    if (String(userId1) === String(userId2)) {
      const err: any = new Error("Không thể tạo chat với chính mình");
      err.status = 400;
      throw err;
    }
    const id1 = new Types.ObjectId(userId1);
    const id2 = new Types.ObjectId(userId2);

    let conversation = await chatRepository.findDirectConversation(id1, id2);
    if (!conversation) {
      conversation = await chatRepository.createConversation({
        type: "direct",
        members: [id1, id2],
        createdBy: id1,
      });
      conversation =
        await chatRepository.findConversationByIdAndMemberPopulated(
          conversation._id,
          id1,
        );
    }
    return toPublicConversation(conversation);
  },

  getOrCreateTeamConversation: async (teamId: string, userId: string) => {
    const team = await TeamModel.findById(teamId);
    if (!team) {
      const err: any = new Error("Nhóm không tồn tại");
      err.status = 404;
      throw err;
    }
    const memberIds = (team.members || []).map(
      (m: any) => new Types.ObjectId(String(m.userId || m._id || m)),
    );
    if (!memberIds.some((id) => String(id) === String(userId))) {
      const err: any = new Error("Bạn không thuộc nhóm này");
      err.status = 403;
      throw err;
    }

    let conversation = await chatRepository.findTeamConversation(
      new Types.ObjectId(teamId),
    );
    if (!conversation) {
      const created = await chatRepository.createConversation({
        type: "group",
        members: memberIds,
        admins: [new Types.ObjectId(String(team.ownerId || userId))],
        createdBy: new Types.ObjectId(userId),
        teamId: new Types.ObjectId(teamId),
        title: team.name,
        avatar: (team as any).avatar,
      });
      conversation = await chatRepository.findTeamConversation(
        new Types.ObjectId(teamId),
      );
      // fallback
      if (!conversation) {
        conversation =
          await chatRepository.findConversationByIdAndMemberPopulated(
            created._id,
            new Types.ObjectId(userId),
          );
      }
    } else {
      // Sync members if team changed
      const teamMemberSet = new Set(memberIds.map((id) => String(id)));
      const convSet = new Set(
        (conversation.members || []).map((m: any) => String(m._id || m)),
      );
      const needSync =
        teamMemberSet.size !== convSet.size ||
        [...teamMemberSet].some((id) => !convSet.has(id));
      if (needSync) {
        await chatRepository.updateConversationMembers(
          conversation._id,
          memberIds,
        );
        conversation = await chatRepository.findTeamConversation(
          new Types.ObjectId(teamId),
        );
      }
    }
    return toPublicConversation(conversation);
  },

  syncTeamConversationMembers: async (teamId: string) => {
    const team = await TeamModel.findById(teamId);
    if (!team) return null;
    const conversation = await chatRepository.findTeamConversation(
      new Types.ObjectId(teamId),
    );
    if (!conversation) return null;
    const memberIds = (team.members || []).map(
      (m: any) => new Types.ObjectId(String(m.userId || m._id || m)),
    );
    await chatRepository.updateConversationMembers(conversation._id, memberIds);
    return chatRepository.findTeamConversation(new Types.ObjectId(teamId));
  },

  listUserConversations: async (
    userId: string,
    options: { limit?: number; offset?: number; search?: string } = {},
  ) => {
    const userObjId = new Types.ObjectId(userId);
    const conversations = await chatRepository.listConversationsForUser(
      userObjId,
      options,
    );
    const ids = conversations.map((c) => String(c._id));
    const unreadMap = await chatRepository.getUnreadCountBulk(ids, userObjId);
    return conversations.map((c) => {
      const p = toPublicConversation(c);
      p.unreadCount = unreadMap[String(c._id)] || 0;
      return p;
    });
  },

  getConversation: async (conversationId: string, userId: string) => {
    const conversation =
      await chatRepository.findConversationByIdAndMemberPopulated(
        conversationId,
        new Types.ObjectId(userId),
      );
    if (!conversation) {
      const err: any = new Error("Không tìm thấy cuộc trò chuyện");
      err.status = 404;
      throw err;
    }
    return toPublicConversation(conversation);
  },

  // ───────────── Messages ─────────────
  sendMessage: async (
    conversationId: string,
    senderId: string,
    payload: {
      content?: string;
      type?: string;
      attachments?: IAttachment[];
      replyTo?: string;
    },
  ) => {
    const conversation = await chatRepository.findConversationByIdAndMember(
      conversationId,
      new Types.ObjectId(senderId),
    );
    if (!conversation) {
      const err: any = new Error("Không tìm thấy cuộc trò chuyện");
      err.status = 404;
      throw err;
    }

    const attachments = payload.attachments || [];
    const content = String(payload.content ?? "").trim();
    if (!content && attachments.length === 0) {
      const err: any = new Error("Tin nhắn không được rỗng");
      err.status = 400;
      throw err;
    }

    const derivedType =
      payload.type ||
      (attachments.length
        ? attachments[0].kind === "image"
          ? "image"
          : attachments[0].kind === "video"
            ? "video"
            : "file"
        : "text");

    const created = await chatRepository.createMessage({
      conversationId: new Types.ObjectId(conversationId),
      senderId: new Types.ObjectId(senderId),
      content,
      type: derivedType as any,
      attachments,
      replyTo: payload.replyTo
        ? new Types.ObjectId(payload.replyTo)
        : undefined,
      seenBy: [new Types.ObjectId(senderId)],
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

    await chatRepository.updateLastMessage(conversationId, {
      content: previewText,
      senderId: new Types.ObjectId(senderId),
      createdAt: new Date(),
      type: derivedType,
    });

    const populated = await chatRepository.findMessagePopulated(created._id);
    return toPublicMessage(populated);
  },

  sendCallEventMessage: async (
    conversationId: string,
    senderId: string,
    call: ICallMeta,
  ) => {
    const labelByStatus: Record<string, string> = {
      started:
        call.kind === "video" ? "📹 Cuộc gọi video" : "📞 Cuộc gọi thoại",
      ended:
        call.kind === "video"
          ? "📹 Cuộc gọi video đã kết thúc"
          : "📞 Cuộc gọi thoại đã kết thúc",
      missed: "⚠️ Cuộc gọi nhỡ",
      rejected: "🚫 Cuộc gọi bị từ chối",
    };
    const content = labelByStatus[call.status] || "Cuộc gọi";
    const created = await chatRepository.createMessage({
      conversationId: new Types.ObjectId(conversationId),
      senderId: new Types.ObjectId(senderId),
      content,
      type: "call" as any,
      call,
      seenBy: [new Types.ObjectId(senderId)],
    });
    await chatRepository.updateLastMessage(conversationId, {
      content,
      senderId: new Types.ObjectId(senderId),
      createdAt: new Date(),
      type: "call",
    });
    const populated = await chatRepository.findMessagePopulated(created._id);
    return toPublicMessage(populated);
  },

  listMessages: async (
    conversationId: string,
    userId: string,
    options: { limit?: number; before?: string; after?: string } = {},
  ) => {
    const conversation = await chatRepository.findConversationByIdAndMember(
      conversationId,
      new Types.ObjectId(userId),
    );
    if (!conversation) {
      const err: any = new Error("Không tìm thấy cuộc trò chuyện");
      err.status = 404;
      throw err;
    }
    const messages = await chatRepository.listMessagesByConversation(
      conversationId,
      options,
    );
    return messages.reverse().map(toPublicMessage);
  },

  markAsSeen: async (messageId: string, userId: string) => {
    const updated = await chatRepository.markMessageAsSeen(
      messageId,
      new Types.ObjectId(userId),
    );
    if (!updated) {
      const err: any = new Error("Không tìm thấy tin nhắn");
      err.status = 404;
      throw err;
    }
    return toPublicMessage(updated);
  },

  markAllAsSeen: async (conversationId: string, userId: string) => {
    const conversation = await chatRepository.findConversationByIdAndMember(
      conversationId,
      new Types.ObjectId(userId),
    );
    if (!conversation) {
      const err: any = new Error("Không tìm thấy cuộc trò chuyện");
      err.status = 404;
      throw err;
    }
    await chatRepository.markAllMessagesAsSeen(
      conversationId,
      new Types.ObjectId(userId),
    );
  },

  getUnreadCount: async (conversationId: string, userId: string) => {
    return chatRepository.getUnreadCount(
      conversationId,
      new Types.ObjectId(userId),
    );
  },

  // Reactions
  toggleReaction: async (
    messageId: string,
    userId: string,
    emoji: string,
    action: "add" | "remove",
  ) => {
    const userObjId = new Types.ObjectId(userId);
    const updated =
      action === "add"
        ? await chatRepository.addReaction(messageId, userObjId, emoji)
        : await chatRepository.removeReaction(messageId, userObjId, emoji);
    if (!updated) {
      const err: any = new Error("Không tìm thấy tin nhắn");
      err.status = 404;
      throw err;
    }
    return toPublicMessage(updated);
  },

  editMessage: async (messageId: string, userId: string, content: string) => {
    const msg = await chatRepository.findMessageById(messageId);
    if (!msg) {
      const err: any = new Error("Không tìm thấy tin nhắn");
      err.status = 404;
      throw err;
    }
    if (String(msg.senderId?._id || msg.senderId) !== String(userId)) {
      const err: any = new Error("Không có quyền sửa tin nhắn này");
      err.status = 403;
      throw err;
    }
    const updated = await chatRepository.editMessage(messageId, content);
    return toPublicMessage(updated);
  },

  deleteMessage: async (messageId: string, userId: string) => {
    const msg = await chatRepository.findMessageById(messageId);
    if (!msg) {
      const err: any = new Error("Không tìm thấy tin nhắn");
      err.status = 404;
      throw err;
    }
    if (String(msg.senderId?._id || msg.senderId) !== String(userId)) {
      const err: any = new Error("Không có quyền xóa tin nhắn này");
      err.status = 403;
      throw err;
    }
    const updated = await chatRepository.softDeleteMessage(messageId);
    return toPublicMessage(updated);
  },
};
