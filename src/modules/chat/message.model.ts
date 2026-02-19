import mongoose, { Schema, Types, Document } from "mongoose";

export type MessageType = "text" | "ai" | "system";

export interface IMessage {
  conversationId: Types.ObjectId;
  senderId?: Types.ObjectId;
  content: string;
  type: MessageType;
  seenBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDoc extends IMessage, Document {}

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
      required: true,
    },
    type: {
      type: String,
      enum: ["text", "ai", "system"],
      default: "text",
    },
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

export const MessageModel = mongoose.model<MessageDoc>("Message", messageSchema);
