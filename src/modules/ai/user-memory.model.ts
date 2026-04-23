import mongoose, { Schema, Types } from "mongoose";

export type UserMemoryScope =
  | "preference" // user's stable preference (e.g. tech_stack=React)
  | "fact" // factual info about user (e.g. role=frontend developer)
  | "context"; // lightweight ephemeral context

export type UserMemoryAttrs = {
  userId: Types.ObjectId;
  scope: UserMemoryScope;
  key: string; // canonical lowercase key (e.g. "tech_stack", "language")
  value: string; // value as string
  domain?: string; // optional domain tag e.g. "it", "language_learning"
  confidence?: number; // 0..1
  occurrences?: number; // how many times we detected this
  lastSeenAt?: Date;
};

export type UserMemoryDoc = mongoose.Document &
  UserMemoryAttrs & {
    createdAt: Date;
    updatedAt: Date;
  };

type UserMemoryModel = mongoose.Model<UserMemoryDoc>;

const userMemorySchema = new Schema<UserMemoryDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    scope: {
      type: String,
      enum: ["preference", "fact", "context"],
      required: true,
      index: true,
    },
    key: { type: String, required: true, trim: true, lowercase: true },
    value: { type: String, required: true, trim: true },
    domain: { type: String, trim: true, lowercase: true },
    confidence: { type: Number, min: 0, max: 1, default: 0.6 },
    occurrences: { type: Number, default: 1, min: 1 },
    lastSeenAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

userMemorySchema.index(
  { userId: 1, key: 1, value: 1 },
  { unique: true, partialFilterExpression: { scope: { $in: ["preference", "fact"] } } },
);
userMemorySchema.index({ userId: 1, scope: 1, lastSeenAt: -1 });

export const UserMemory =
  (mongoose.models.UserMemory as UserMemoryModel) ||
  mongoose.model<UserMemoryDoc>(
    "UserMemory",
    userMemorySchema,
    "user_memories",
  );
