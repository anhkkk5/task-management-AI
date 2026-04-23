import mongoose, { Schema, Types, Document } from "mongoose";

export type MessageType =
  | "text"
  | "ai"
  | "system"
  | "image"
  | "video"
  | "file"
  | "call";

export type AttachmentKind = "image" | "video" | "file";

export interface IAttachment {
  kind: AttachmentKind;
  url: string;
  publicId?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
}

export interface IReaction {
  userId: Types.ObjectId;
  emoji: string;
  createdAt: Date;
}

export interface ICallMeta {
  callId: string;
  kind: "audio" | "video";
  status: "started" | "ended" | "missed" | "rejected";
  startedAt?: Date;
  endedAt?: Date;
  durationSec?: number;
  participants?: Types.ObjectId[];
}

export interface IMessage {
  conversationId: Types.ObjectId;
  senderId?: Types.ObjectId;
  content: string;
  type: MessageType;
  attachments?: IAttachment[];
  reactions?: IReaction[];
  replyTo?: Types.ObjectId;
  editedAt?: Date;
  deletedAt?: Date;
  call?: ICallMeta;
  seenBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDoc extends IMessage, Document {}

const attachmentSchema = new Schema<IAttachment>(
  {
    kind: { type: String, enum: ["image", "video", "file"], required: true },
    url: { type: String, required: true },
    publicId: String,
    name: String,
    mimeType: String,
    size: Number,
    width: Number,
    height: Number,
    duration: Number,
    thumbnailUrl: String,
  },
  { _id: false },
);

const reactionSchema = new Schema<IReaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    emoji: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const callMetaSchema = new Schema<ICallMeta>(
  {
    callId: { type: String, required: true },
    kind: { type: String, enum: ["audio", "video"], required: true },
    status: {
      type: String,
      enum: ["started", "ended", "missed", "rejected"],
      required: true,
    },
    startedAt: Date,
    endedAt: Date,
    durationSec: Number,
    participants: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false },
);

const messageSchema = new Schema<MessageDoc>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    content: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["text", "ai", "system", "image", "video", "file", "call"],
      default: "text",
    },
    attachments: { type: [attachmentSchema], default: [] },
    reactions: { type: [reactionSchema], default: [] },
    replyTo: {
      type: Schema.Types.ObjectId,
      ref: "Message",
    },
    editedAt: Date,
    deletedAt: Date,
    call: callMetaSchema,
    seenBy: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
    collection: "messages",
  },
);

// Indexes for query optimization
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ seenBy: 1 });

export const MessageModel = mongoose.model<MessageDoc>(
  "Message",
  messageSchema,
);
