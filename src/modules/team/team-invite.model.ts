import mongoose, { Schema, Types } from "mongoose";
import { TeamRole } from "./team.model";

export type TeamInviteAttrs = {
  teamId: Types.ObjectId;
  inviterId: Types.ObjectId;
  email: string;
  role: TeamRole;
  token: string;
  expiresAt: Date;
  status: "pending" | "accepted" | "declined" | "expired";
};

export type TeamInviteDoc = mongoose.Document &
  TeamInviteAttrs & {
    createdAt: Date;
    updatedAt: Date;
  };

type TeamInviteModel = mongoose.Model<TeamInviteDoc>;

const teamInviteSchema = new Schema<TeamInviteDoc>(
  {
    teamId: { type: Schema.Types.ObjectId, required: true, index: true },
    inviterId: { type: Schema.Types.ObjectId, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: ["admin", "member", "viewer"],
      default: "member",
    },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "expired"],
      default: "pending",
    },
  },
  { timestamps: true },
);

teamInviteSchema.index({ teamId: 1, email: 1, status: 1 });

export const TeamInvite =
  (mongoose.models.TeamInvite as TeamInviteModel) ||
  mongoose.model<TeamInviteDoc>("TeamInvite", teamInviteSchema);
