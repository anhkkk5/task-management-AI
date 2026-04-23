import mongoose, { Schema, Types, Document } from "mongoose";

export type ConversationType = "direct" | "group" | "task";

export interface IConversation {
  type: ConversationType;
  members: Types.ObjectId[];
  admins?: Types.ObjectId[];
  createdBy?: Types.ObjectId;
  taskId?: Types.ObjectId;
  teamId?: Types.ObjectId;
  title?: string;
  avatar?: string;
  lastMessage?: {
    content: string;
    senderId: Types.ObjectId;
    createdAt: Date;
    type?: string;
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
    admins: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: "Team",
    },
    title: {
      type: String,
    },
    avatar: {
      type: String,
    },
    lastMessage: {
      content: String,
      senderId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      createdAt: Date,
      type: String,
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
conversationSchema.index({ teamId: 1 }, { unique: true, sparse: true });
conversationSchema.index({ type: 1 });
conversationSchema.index({ updatedAt: -1 });

export const ConversationModel =
  (mongoose.models.Conversation as mongoose.Model<ConversationDoc>) ||
  mongoose.model<ConversationDoc>("Conversation", conversationSchema);
