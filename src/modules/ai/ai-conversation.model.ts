import mongoose, { Schema, Types } from "mongoose";

export type AiConversationAttrs = {
  userId: Types.ObjectId;
  title: string;
  parentTaskId?: Types.ObjectId;
  domain?: string;
  lastSubtaskKey?: string;
};

export type AiConversationDoc = mongoose.Document & {
  userId: Types.ObjectId;
  title: string;
  parentTaskId?: Types.ObjectId;
  domain?: string;
  lastSubtaskKey?: string;
  createdAt: Date;
  updatedAt: Date;
};

type AiConversationModel = mongoose.Model<AiConversationDoc>;

const aiConversationSchema = new Schema<AiConversationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, required: true, trim: true },
    parentTaskId: { type: Schema.Types.ObjectId, ref: "Task", index: true },
    domain: { type: String, trim: true, lowercase: true },
    lastSubtaskKey: { type: String, trim: true },
  },
  { timestamps: true },
);

aiConversationSchema.index({ userId: 1, updatedAt: -1 });
// 1 user - 1 parentTask - 1 conversation
aiConversationSchema.index(
  { userId: 1, parentTaskId: 1 },
  {
    unique: true,
    partialFilterExpression: { parentTaskId: { $exists: true } },
  },
);

export const AiConversation =
  (mongoose.models.AiConversation as AiConversationModel) ||
  mongoose.model<AiConversationDoc>(
    "AiConversation",
    aiConversationSchema,
    "ai_conversations",
  );
