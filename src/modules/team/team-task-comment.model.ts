import mongoose, { Schema, Types } from "mongoose";

export type TeamTaskCommentAttrs = {
  teamId: Types.ObjectId;
  taskId: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string;
  content: string;
  mentionedUserIds?: Types.ObjectId[];
};

export type TeamTaskCommentDoc = mongoose.Document & {
  teamId: Types.ObjectId;
  taskId: Types.ObjectId;
  authorId: Types.ObjectId;
  authorName: string;
  content: string;
  mentionedUserIds: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
};

type TeamTaskCommentModel = mongoose.Model<TeamTaskCommentDoc>;

const teamTaskCommentSchema = new Schema<TeamTaskCommentDoc>(
  {
    teamId: { type: Schema.Types.ObjectId, required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, required: true, index: true },
    authorName: { type: String, required: true, trim: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    mentionedUserIds: { type: [Schema.Types.ObjectId], default: [] },
  },
  {
    timestamps: true,
    collection: "team_task_comments",
  },
);

teamTaskCommentSchema.index({ teamId: 1, taskId: 1, createdAt: -1 });
teamTaskCommentSchema.index({ taskId: 1, createdAt: -1 });
teamTaskCommentSchema.index({ mentionedUserIds: 1, createdAt: -1 });

export const TeamTaskComment =
  (mongoose.models.TeamTaskComment as TeamTaskCommentModel) ||
  mongoose.model<TeamTaskCommentDoc>("TeamTaskComment", teamTaskCommentSchema);
