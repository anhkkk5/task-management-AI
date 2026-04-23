import { Types } from "mongoose";
import { ConversationModel, IConversation } from "./chat.model";
import { MessageModel, IMessage } from "./message.model";

const USER_POPULATE = "_id name avatar email";
const MESSAGE_POPULATE_REPLY = {
  path: "replyTo",
  select: "_id content type senderId attachments deletedAt",
  populate: { path: "senderId", select: USER_POPULATE },
};

const normalizeLastMessageForRuntimeSchema = (lastMessage: {
  content: string;
  senderId: Types.ObjectId;
  createdAt: Date;
  type?: string;
}) => {
  const lastMessagePath = ConversationModel.schema.path("lastMessage") as
    | { instance?: string }
    | undefined;

  if (lastMessagePath?.instance === "String") {
    return lastMessage.content;
  }

  return lastMessage;
};

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

  findConversationByIdAndMemberPopulated: async (
    conversationId: string | Types.ObjectId,
    userId: Types.ObjectId,
  ) => {
    return ConversationModel.findOne({
      _id: conversationId,
      members: { $in: [userId] },
    })
      .populate("members", USER_POPULATE)
      .populate("taskId", "_id title")
      .populate("teamId", "_id name avatar");
  },

  findDirectConversation: async (
    userId1: Types.ObjectId,
    userId2: Types.ObjectId,
  ) => {
    return ConversationModel.findOne({
      type: "direct",
      members: { $all: [userId1, userId2], $size: 2 },
    })
      .populate("members", USER_POPULATE)
      .populate("taskId", "_id title");
  },

  findTaskConversation: async (taskId: Types.ObjectId) => {
    return ConversationModel.findOne({
      type: "task",
      taskId,
    });
  },

  findTeamConversation: async (teamId: Types.ObjectId) => {
    return ConversationModel.findOne({
      type: "group",
      teamId,
    })
      .populate("members", USER_POPULATE)
      .populate("teamId", "_id name avatar");
  },

  updateConversationMembers: async (
    conversationId: string | Types.ObjectId,
    members: Types.ObjectId[],
  ) => {
    return ConversationModel.findByIdAndUpdate(
      conversationId,
      { members, updatedAt: new Date() },
      { new: true },
    );
  },

  listConversationsForUser: async (
    userId: Types.ObjectId,
    options: { limit?: number; offset?: number; search?: string } = {},
  ) => {
    const { limit = 30, offset = 0, search } = options;
    const query: any = {
      members: { $in: [userId] },
      type: { $in: ["direct", "group"] },
    };
    if (search && search.trim()) {
      query.title = { $regex: search.trim(), $options: "i" };
    }
    return ConversationModel.find(query)
      .sort({ updatedAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate("members", USER_POPULATE)
      .populate("taskId", "_id title")
      .populate("teamId", "_id name avatar");
  },

  updateLastMessage: async (
    conversationId: string | Types.ObjectId,
    lastMessage: {
      content: string;
      senderId: Types.ObjectId;
      createdAt: Date;
      type?: string;
    },
  ) => {
    const normalizedLastMessage =
      normalizeLastMessageForRuntimeSchema(lastMessage);

    return ConversationModel.findByIdAndUpdate(
      conversationId,
      { lastMessage: normalizedLastMessage, updatedAt: new Date() },
      { new: true },
    );
  },

  // Message operations
  createMessage: async (data: Omit<IMessage, "createdAt" | "updatedAt">) => {
    return MessageModel.create(data);
  },

  findMessageById: async (messageId: string | Types.ObjectId) => {
    return MessageModel.findById(messageId)
      .populate("senderId", USER_POPULATE)
      .populate(MESSAGE_POPULATE_REPLY);
  },

  findMessagePopulated: async (messageId: string | Types.ObjectId) => {
    return MessageModel.findById(messageId)
      .populate("senderId", USER_POPULATE)
      .populate(MESSAGE_POPULATE_REPLY)
      .lean();
  },

  listMessagesByConversation: async (
    conversationId: string | Types.ObjectId,
    options: { limit?: number; before?: string; after?: string } = {},
  ) => {
    const { limit = 30, before, after } = options;
    const query: any = { conversationId };
    if (before) query._id = { $lt: new Types.ObjectId(before) };
    if (after) query._id = { $gt: new Types.ObjectId(after) };
    return MessageModel.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("senderId", USER_POPULATE)
      .populate(MESSAGE_POPULATE_REPLY)
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
    )
      .populate("senderId", USER_POPULATE)
      .populate(MESSAGE_POPULATE_REPLY);
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

  getUnreadCount: async (
    conversationId: string | Types.ObjectId,
    userId: Types.ObjectId,
  ) => {
    return MessageModel.countDocuments({
      conversationId,
      senderId: { $ne: userId },
      seenBy: { $nin: [userId] },
      deletedAt: { $exists: false },
    });
  },

  getUnreadCountBulk: async (
    conversationIds: (string | Types.ObjectId)[],
    userId: Types.ObjectId,
  ) => {
    if (!conversationIds.length) return {} as Record<string, number>;
    const rows = await MessageModel.aggregate([
      {
        $match: {
          conversationId: {
            $in: conversationIds.map((id) => new Types.ObjectId(String(id))),
          },
          senderId: { $ne: userId },
          seenBy: { $nin: [userId] },
          deletedAt: { $exists: false },
        },
      },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ]);
    const map: Record<string, number> = {};
    for (const r of rows) map[String(r._id)] = r.count;
    return map;
  },

  // Reactions
  addReaction: async (
    messageId: string | Types.ObjectId,
    userId: Types.ObjectId,
    emoji: string,
  ) => {
    // Remove existing reaction of same user+emoji (idempotent) then push fresh one
    await MessageModel.findByIdAndUpdate(messageId, {
      $pull: { reactions: { userId, emoji } },
    });
    return MessageModel.findByIdAndUpdate(
      messageId,
      { $push: { reactions: { userId, emoji, createdAt: new Date() } } },
      { new: true },
    )
      .populate("senderId", USER_POPULATE)
      .populate(MESSAGE_POPULATE_REPLY);
  },

  removeReaction: async (
    messageId: string | Types.ObjectId,
    userId: Types.ObjectId,
    emoji: string,
  ) => {
    return MessageModel.findByIdAndUpdate(
      messageId,
      { $pull: { reactions: { userId, emoji } } },
      { new: true },
    )
      .populate("senderId", USER_POPULATE)
      .populate(MESSAGE_POPULATE_REPLY);
  },

  editMessage: async (messageId: string | Types.ObjectId, content: string) => {
    return MessageModel.findByIdAndUpdate(
      messageId,
      { content, editedAt: new Date() },
      { new: true },
    )
      .populate("senderId", USER_POPULATE)
      .populate(MESSAGE_POPULATE_REPLY);
  },

  softDeleteMessage: async (messageId: string | Types.ObjectId) => {
    return MessageModel.findByIdAndUpdate(
      messageId,
      {
        content: "",
        attachments: [],
        deletedAt: new Date(),
      },
      { new: true },
    )
      .populate("senderId", USER_POPULATE)
      .populate(MESSAGE_POPULATE_REPLY);
  },
};
