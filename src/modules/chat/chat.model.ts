import mongoose, { Schema, Types, Document } from "mongoose";

export type ConversationType = "direct" | "group" | "task";

export interface IConversation {
  type: ConversationType;
  members: Types.ObjectId[];
  taskId?: Types.ObjectId;
  title?: string;
  lastMessage?: {
    content: string;
    senderId: Types.ObjectId;
    createdAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationDoc extends IConversation, Document {}

const conversationSchema = new Schema<ConversationDoc>(
  {
    type: {
      type: String,
      enum: ["direct", "group", "task"],
      required: true,
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
    },
    title: {
      type: String,
    },
    lastMessage: {
      content: String,
      senderId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      createdAt: Date,
    },
  },
  {
    timestamps: true,
    collection: "conversations",
  },
);

// Indexes for query optimization
conversationSchema.index({ members: 1 });
conversationSchema.index({ taskId: 1 });
conversationSchema.index({ type: 1 });
conversationSchema.index({ updatedAt: -1 });

export const ConversationModel = mongoose.model<ConversationDoc>(
  "Conversation",
  conversationSchema,
);
