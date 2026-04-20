import mongoose, { Schema, Types } from "mongoose";

export type TeamRole = "owner" | "admin" | "member" | "viewer";

export type TeamMember = {
  userId: Types.ObjectId;
  email: string;
  name: string;
  avatar?: string;
  role: TeamRole;
  joinedAt: Date;
};

export type TeamAttrs = {
  name: string;
  description?: string;
  ownerId: Types.ObjectId;
  members: TeamMember[];
  isArchived?: boolean;
};

export type TeamDoc = mongoose.Document & {
  name: string;
  description?: string;
  ownerId: Types.ObjectId;
  members: TeamMember[];
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type TeamModel = mongoose.Model<TeamDoc>;

const teamMemberSchema = new Schema<TeamMember>(
  {
    userId: { type: Schema.Types.ObjectId, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    avatar: { type: String },
    role: {
      type: String,
      enum: ["owner", "admin", "member", "viewer"],
      default: "member",
    },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const teamSchema = new Schema<TeamDoc>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    description: { type: String, trim: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, index: true },
    members: { type: [teamMemberSchema], default: [] },
    isArchived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

teamSchema.index({ "members.userId": 1 });

export const Team =
  (mongoose.models.Team as TeamModel) ||
  mongoose.model<TeamDoc>("Team", teamSchema);
