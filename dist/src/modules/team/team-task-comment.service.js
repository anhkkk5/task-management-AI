"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teamTaskCommentService = void 0;
const mongoose_1 = require("mongoose");
const team_model_1 = require("./team.model");
const task_model_1 = require("../task/task.model");
const team_task_comment_model_1 = require("./team-task-comment.model");
const notification_service_1 = require("../notification/notification.service");
const notification_model_1 = require("../notification/notification.model");
const MAX_COMMENT_LENGTH = 2000;
const toPublic = (doc) => ({
    id: String(doc._id),
    teamId: String(doc.teamId),
    taskId: String(doc.taskId),
    authorId: String(doc.authorId),
    authorName: doc.authorName,
    content: doc.content,
    mentionedUserIds: (doc.mentionedUserIds || []).map((id) => String(id)),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
});
const normalizeMentionToken = (value) => value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
const normalizeNameToken = (value) => value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
const buildCommentPreview = (content) => {
    if (content.length <= 120)
        return content;
    return `${content.slice(0, 117)}...`;
};
const resolveMentionedUserIds = (content, members, excludeUserId) => {
    const mentionMatches = Array.from(content.matchAll(/@([a-zA-Z0-9._-]{2,80})/g));
    const mentionTokens = new Set(mentionMatches
        .map((m) => normalizeMentionToken(m[1] || ""))
        .filter((token) => token.length >= 2));
    if (mentionTokens.size === 0)
        return [];
    const mentioned = new Set();
    for (const member of members) {
        const memberId = String(member.userId);
        if (memberId === excludeUserId)
            continue;
        const emailToken = normalizeMentionToken(member.email);
        const localToken = normalizeMentionToken(member.email.split("@")[0] || "");
        const nameToken = normalizeNameToken(member.name);
        if (mentionTokens.has(emailToken) ||
            mentionTokens.has(localToken) ||
            mentionTokens.has(nameToken)) {
            mentioned.add(memberId);
        }
    }
    return [...mentioned];
};
async function getTeamTaskContext(teamId, taskId, userId) {
    if (!mongoose_1.Types.ObjectId.isValid(teamId)) {
        throw { status: 400, message: "Team ID không hợp lệ" };
    }
    if (!mongoose_1.Types.ObjectId.isValid(taskId)) {
        throw { status: 400, message: "Task ID không hợp lệ" };
    }
    const team = await team_model_1.Team.findById(teamId);
    if (!team || team.isArchived) {
        throw { status: 404, message: "Team không tồn tại" };
    }
    const member = team.members.find((m) => String(m.userId) === userId);
    if (!member) {
        throw { status: 403, message: "Bạn không phải thành viên của team này" };
    }
    const task = await task_model_1.Task.findOne({
        _id: new mongoose_1.Types.ObjectId(taskId),
        "teamAssignment.teamId": new mongoose_1.Types.ObjectId(teamId),
        isArchived: false,
    });
    if (!task) {
        throw { status: 404, message: "Task không tồn tại trong team này" };
    }
    return { team, member, task };
}
async function notifyCommentParticipants(params) {
    if (!params.recipients.length)
        return;
    await Promise.all(params.recipients.map((userId) => notification_service_1.notificationService.create({
        userId,
        type: notification_model_1.NotificationType.TEAM_TASK_COMMENT,
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
    })));
}
async function notifyMentionedUsers(params) {
    if (!params.recipients.length)
        return;
    await Promise.all(params.recipients.map((userId) => notification_service_1.notificationService.create({
        userId,
        type: notification_model_1.NotificationType.TEAM_TASK_MENTION,
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
    })));
}
exports.teamTaskCommentService = {
    listByTask: async (teamId, taskId, requesterId) => {
        await getTeamTaskContext(teamId, taskId, requesterId);
        const comments = await team_task_comment_model_1.TeamTaskComment.find({
            teamId: new mongoose_1.Types.ObjectId(teamId),
            taskId: new mongoose_1.Types.ObjectId(taskId),
        })
            .sort({ createdAt: 1 })
            .lean();
        return { items: comments.map(toPublic) };
    },
    create: async (teamId, taskId, requesterId, contentInput) => {
        const { team, member, task } = await getTeamTaskContext(teamId, taskId, requesterId);
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
        const mentionedUserIds = resolveMentionedUserIds(content, team.members, requesterId);
        const created = await team_task_comment_model_1.TeamTaskComment.create({
            teamId: new mongoose_1.Types.ObjectId(teamId),
            taskId: new mongoose_1.Types.ObjectId(taskId),
            authorId: new mongoose_1.Types.ObjectId(requesterId),
            authorName: member.name,
            content,
            mentionedUserIds: mentionedUserIds.map((id) => new mongoose_1.Types.ObjectId(id)),
        });
        const commentPreview = buildCommentPreview(content);
        const taskAssigneeId = String(task?.teamAssignment?.assigneeId || "");
        const taskReporterId = String(task?.teamAssignment?.assignedBy || "");
        const mentionRecipientSet = new Set(mentionedUserIds);
        const participantRecipients = new Set([taskAssigneeId, taskReporterId]);
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
                taskPriority: task?.priority,
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
                taskPriority: task?.priority,
                actorId: requesterId,
            }),
        ]);
        return { comment: toPublic(created) };
    },
};
