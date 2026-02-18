import mongoose, { Schema, Types } from "mongoose";

export type AiConversationAttrs = {
  userId: Types.ObjectId;
  title: string;
};

export type AiConversationDoc = mongoose.Document & {
  userId: Types.ObjectId;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

type AiConversationModel = mongoose.Model<AiConversationDoc>;

const aiConversationSchema = new Schema<AiConversationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

aiConversationSchema.index({ userId: 1, updatedAt: -1 });

export const AiConversation =
  (mongoose.models.AiConversation as AiConversationModel) ||
  mongoose.model<AiConversationDoc>(
    "AiConversation",
    aiConversationSchema,
    "ai_conversations",
  );
