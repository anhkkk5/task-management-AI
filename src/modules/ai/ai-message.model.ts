import mongoose, { Schema, Types } from "mongoose";

export type AiMessageRole = "user" | "assistant" | "system";

export type AiMessageMeta = {
  kind?: "chat" | "transition" | "summary";
  subtaskKey?: string;
  subtaskTitle?: string;
  subtaskIndex?: number;
};

export type AiMessageAttrs = {
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: AiMessageRole;
  content: string;
  tokens?: number;
  meta?: AiMessageMeta;
};

export type AiMessageDoc = mongoose.Document & {
  conversationId: Types.ObjectId;
  userId: Types.ObjectId;
  role: AiMessageRole;
  content: string;
  tokens?: number;
  meta?: AiMessageMeta;
  createdAt: Date;
  updatedAt: Date;
};

type AiMessageModel = mongoose.Model<AiMessageDoc>;

const aiMessageSchema = new Schema<AiMessageDoc>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    role: {
      type: String,
      required: true,
      enum: ["user", "assistant", "system"],
      index: true,
    },
    content: { type: String, required: true },
    tokens: { type: Number },
    meta: {
      kind: {
        type: String,
        enum: ["chat", "transition", "summary"],
        default: "chat",
      },
      subtaskKey: String,
      subtaskTitle: String,
      subtaskIndex: Number,
    },
  },
  { timestamps: true },
);

aiMessageSchema.index({ conversationId: 1, createdAt: 1 });

export const AiMessage =
  (mongoose.models.AiMessage as AiMessageModel) ||
  mongoose.model<AiMessageDoc>("AiMessage", aiMessageSchema, "ai_messages");
