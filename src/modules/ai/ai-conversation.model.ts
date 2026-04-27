import mongoose, { Schema, Types } from "mongoose";

export type ProposalDraft = {
  activityName: string;
  durationMin: number;
  sessionsPerWeek?: number;
  windowStart?: string;
  windowEnd?: string;
  daysAllowed?: string[];
  minGapDays?: number;
  sessions: {
    date: string;
    start: string;
    end: string;
    focus?: string;
  }[];
  createdAt: Date;
};

export type AiConversationContext = {
  domain?: string;
  lastSubtaskKey?: string;
  proposalDraft?: ProposalDraft;
};

export type AiConversationAttrs = {
  userId: Types.ObjectId;
  title: string;
  parentTaskId?: Types.ObjectId;
  domain?: string;
  lastSubtaskKey?: string;
  context?: AiConversationContext;
};

export type AiConversationDoc = mongoose.Document & {
  userId: Types.ObjectId;
  title: string;
  parentTaskId?: Types.ObjectId;
  domain?: string;
  lastSubtaskKey?: string;
  context?: AiConversationContext;
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
    context: {
      type: {
        domain: { type: String, trim: true, lowercase: true },
        lastSubtaskKey: { type: String, trim: true },
        proposalDraft: {
          activityName: { type: String, trim: true },
          durationMin: { type: Number, min: 1 },
          sessionsPerWeek: { type: Number, min: 1 },
          windowStart: { type: String, trim: true },
          windowEnd: { type: String, trim: true },
          daysAllowed: { type: [String] },
          minGapDays: { type: Number, min: 0 },
          sessions: [
            {
              date: { type: String, trim: true },
              start: { type: String, trim: true },
              end: { type: String, trim: true },
              focus: { type: String, trim: true },
            },
          ],
          createdAt: { type: Date },
        },
      },
      _id: false,
    },
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
