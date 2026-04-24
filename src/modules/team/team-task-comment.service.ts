import { Types } from "mongoose";
import { Team } from "./team.model";
import { Task } from "../task/task.model";
import { TeamTaskComment } from "./team-task-comment.model";
import { notificationService } from "../notification/notification.service";
import { NotificationType } from "../notification/notification.model";

const MAX_COMMENT_LENGTH = 2000;

type PublicTeamTaskComment = {
  id: string;
  teamId: string;
  taskId: string;
  authorId: string;
  authorName: string;
  content: string;
  mentionedUserIds: string[];
  createdAt: Date;
  updatedAt: Date;
};

type TeamMemberLike = {
  userId: Types.ObjectId;
  email: string;
  name: string;
};

const toPublic = (doc: any): PublicTeamTaskComment => ({
  id: String(doc._id),
  teamId: String(doc.teamId),
  taskId: String(doc.taskId),
  authorId: String(doc.authorId),
  authorName: doc.authorName,
  content: doc.content,
  mentionedUserIds: (doc.mentionedUserIds || []).map((id: any) => String(id)),
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const normalizeMentionToken = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");

const normalizeNameToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");

const buildCommentPreview = (content: string): string => {
  if (content.length <= 120) return content;
  return `${content.slice(0, 117)}...`;
};

const resolveMentionedUserIds = (
  content: string,
  members: TeamMemberLike[],
  excludeUserId: string,
): string[] => {
  const mentionMatches = Array.from(content.matchAll(/@([a-zA-Z0-9._-]{2,80})/g));
  const mentionTokens = new Set(
    mentionMatches
      .map((m) => normalizeMentionToken(m[1] || ""))
      .filter((token) => token.length >= 2),
  );

  if (mentionTokens.size === 0) return [];

  const mentioned = new Set<string>();
  for (const member of members) {
    const memberId = String(member.userId);
    if (memberId === excludeUserId) continue;

    const emailToken = normalizeMentionToken(member.email);
    const localToken = normalizeMentionToken(member.email.split("@")[0] || "");
    const nameToken = normalizeNameToken(member.name);

    if (
      mentionTokens.has(emailToken) ||
      mentionTokens.has(localToken) ||
      mentionTokens.has(nameToken)
    ) {
      mentioned.add(memberId);
    }
  }

  return [...mentioned];
};

async function getTeamTaskContext(teamId: string, taskId: string, userId: string) {
  if (!Types.ObjectId.isValid(teamId)) {
    throw { status: 400, message: "Team ID không hợp lệ" };
  }
  if (!Types.ObjectId.isValid(taskId)) {
    throw { status: 400, message: "Task ID không hợp lệ" };
  }

  const team = await Team.findById(teamId);
  if (!team || team.isArchived) {
    throw { status: 404, message: "Team không tồn tại" };
  }

  const member = team.members.find((m) => String(m.userId) === userId);
  if (!member) {
    throw { status: 403, message: "Bạn không phải thành viên của team này" };
  }

  const task = await Task.findOne({
    _id: new Types.ObjectId(taskId),
    "teamAssignment.teamId": new Types.ObjectId(teamId),
    isArchived: false,
  });
  if (!task) {
    throw { status: 404, message: "Task không tồn tại trong team này" };
  }

  return { team, member, task };
}

async function notifyCommentParticipants(params: {
  recipients: string[];
  authorName: string;
  teamName: string;
  taskTitle: string;
  taskId: string;
  teamId: string;
  commentId: string;
  commentPreview: string;
  taskPriority?: string;
  actorId: string;
}) {
  if (!params.recipients.length) return;

  await Promise.all(
    params.recipients.map((userId) =>
      notificationService.create({
        userId,
        type: NotificationType.TEAM_TASK_COMMENT,
        title: `Bình luận mới ở task: ${params.taskTitle}`,
        content: `${params.authorName} đã bình luận trong task \"${params.taskTitle}\" (${params.teamName}).`,
        channels: { inApp: true, email: true },
        data: {
          taskId: params.taskId,
          teamId: params.teamId,
          taskPriority: params.taskPriority,
          actorId: params.actorId,
          actorName: params.authorName,
          commentId: params.commentId,
          commentPreview: params.commentPreview,
          actions: [
            {
              key: "open-team-task",
              label: "Mở task",
              action: "open_team_task",
              style: "primary",
              payload: {
                teamId: params.teamId,
                taskId: params.taskId,
                commentId: params.commentId,
              },
            },
          ],
        },
      }),
    ),
  );
}

async function notifyMentionedUsers(params: {
  recipients: string[];
  authorName: string;
  teamName: string;
  taskTitle: string;
  taskId: string;
  teamId: string;
  commentId: string;
  commentPreview: string;
  taskPriority?: string;
  actorId: string;
}) {
  if (!params.recipients.length) return;

  await Promise.all(
    params.recipients.map((userId) =>
      notificationService.create({
        userId,
        type: NotificationType.TEAM_TASK_MENTION,
        title: `Bạn được nhắc đến trong task: ${params.taskTitle}`,
        content: `${params.authorName} đã nhắc đến bạn trong một bình luận (${params.teamName}).`,
        channels: { inApp: true, email: true },
        data: {
          taskId: params.taskId,
          teamId: params.teamId,
          taskPriority: params.taskPriority,
          actorId: params.actorId,
          actorName: params.authorName,
          commentId: params.commentId,
          commentPreview: params.commentPreview,
          actions: [
            {
              key: "open-team-task",
              label: "Xem bình luận",
              action: "open_team_task",
              style: "primary",
              payload: {
                teamId: params.teamId,
                taskId: params.taskId,
                commentId: params.commentId,
              },
            },
          ],
        },
      }),
    ),
  );
}

export const teamTaskCommentService = {
  listByTask: async (
    teamId: string,
    taskId: string,
    requesterId: string,
  ): Promise<{ items: PublicTeamTaskComment[] }> => {
    await getTeamTaskContext(teamId, taskId, requesterId);

    const comments = await TeamTaskComment.find({
      teamId: new Types.ObjectId(teamId),
      taskId: new Types.ObjectId(taskId),
    })
      .sort({ createdAt: 1 })
      .lean();

    return { items: comments.map(toPublic) };
  },

  create: async (
    teamId: string,
    taskId: string,
    requesterId: string,
    contentInput: string,
  ): Promise<{ comment: PublicTeamTaskComment }> => {
    const { team, member, task } = await getTeamTaskContext(
      teamId,
      taskId,
      requesterId,
    );

    const content = String(contentInput || "").trim();
    if (!content) {
      throw { status: 400, message: "Nội dung bình luận không được để trống" };
    }
    if (content.length > MAX_COMMENT_LENGTH) {
      throw {
        status: 400,
        message: `Nội dung bình luận không được vượt quá ${MAX_COMMENT_LENGTH} ký tự`,
      };
    }

    const mentionedUserIds = resolveMentionedUserIds(
      content,
      team.members as TeamMemberLike[],
      requesterId,
    );

    const created = await TeamTaskComment.create({
      teamId: new Types.ObjectId(teamId),
      taskId: new Types.ObjectId(taskId),
      authorId: new Types.ObjectId(requesterId),
      authorName: member.name,
      content,
      mentionedUserIds: mentionedUserIds.map((id) => new Types.ObjectId(id)),
    });

    const commentPreview = buildCommentPreview(content);
    const taskAssigneeId = String(task?.teamAssignment?.assigneeId || "");
    const taskReporterId = String(task?.teamAssignment?.assignedBy || "");

    const mentionRecipientSet = new Set(mentionedUserIds);
    const participantRecipients = new Set<string>([taskAssigneeId, taskReporterId]);
    participantRecipients.delete("");
    participantRecipients.delete(requesterId);
    for (const mentionedUserId of mentionRecipientSet) {
      participantRecipients.delete(mentionedUserId);
    }

    await Promise.all([
      notifyCommentParticipants({
        recipients: [...participantRecipients],
        authorName: member.name,
        teamName: team.name,
        taskTitle: task.title,
        taskId,
        teamId,
        commentId: String(created._id),
        commentPreview,
        taskPriority: (task as any)?.priority,
        actorId: requesterId,
      }),
      notifyMentionedUsers({
        recipients: [...mentionRecipientSet],
        authorName: member.name,
        teamName: team.name,
        taskTitle: task.title,
        taskId,
        teamId,
        commentId: String(created._id),
        commentPreview,
        taskPriority: (task as any)?.priority,
        actorId: requesterId,
      }),
    ]);

    return { comment: toPublic(created) };
  },
};
