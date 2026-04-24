import { Types } from "mongoose";
import { teamTaskCommentService } from "../team-task-comment.service";
import { Team } from "../team.model";
import { Task } from "../../task/task.model";
import { TeamTaskComment } from "../team-task-comment.model";
import { notificationService } from "../../notification/notification.service";
import { NotificationType } from "../../notification/notification.model";

jest.mock("../team.model", () => ({
  Team: { findById: jest.fn() },
}));

jest.mock("../../task/task.model", () => ({
  Task: { findOne: jest.fn() },
}));

jest.mock("../team-task-comment.model", () => ({
  TeamTaskComment: { create: jest.fn(), find: jest.fn() },
}));

jest.mock("../../notification/notification.service", () => ({
  notificationService: { create: jest.fn() },
}));

describe("teamTaskCommentService.create", () => {
  const teamId = new Types.ObjectId().toString();
  const taskId = new Types.ObjectId().toString();
  const requesterId = new Types.ObjectId().toString();
  const assigneeId = new Types.ObjectId().toString();
  const reporterId = new Types.ObjectId().toString();

  const makeMember = (userId: string, name: string, email: string) => ({
    userId: new Types.ObjectId(userId),
    name,
    email,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates comment and notifies assignee + reporter when no mention", async () => {
    (Team.findById as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(teamId),
      name: "Alpha Team",
      isArchived: false,
      members: [
        makeMember(requesterId, "Author", "author@example.com"),
        makeMember(assigneeId, "Assignee", "assignee@example.com"),
        makeMember(reporterId, "Reporter", "reporter@example.com"),
      ],
    });

    (Task.findOne as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(taskId),
      title: "Implement comments",
      priority: "high",
      teamAssignment: {
        assigneeId: new Types.ObjectId(assigneeId),
        assignedBy: new Types.ObjectId(reporterId),
      },
    });

    (TeamTaskComment.create as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(),
      teamId: new Types.ObjectId(teamId),
      taskId: new Types.ObjectId(taskId),
      authorId: new Types.ObjectId(requesterId),
      authorName: "Author",
      content: "No mention in this comment",
      mentionedUserIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await teamTaskCommentService.create(
      teamId,
      taskId,
      requesterId,
      "No mention in this comment",
    );

    expect(TeamTaskComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mentionedUserIds: [],
      }),
    );

    const notifications = (notificationService.create as jest.Mock).mock.calls.map(
      (call) => call[0],
    );

    expect(notifications).toHaveLength(2);
    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: assigneeId,
          type: NotificationType.TEAM_TASK_COMMENT,
        }),
        expect.objectContaining({
          userId: reporterId,
          type: NotificationType.TEAM_TASK_COMMENT,
        }),
      ]),
    );
  });

  it("sends mention notification and avoids duplicate participant notification", async () => {
    (Team.findById as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(teamId),
      name: "Alpha Team",
      isArchived: false,
      members: [
        makeMember(requesterId, "Author", "author@example.com"),
        makeMember(assigneeId, "Assignee", "assignee@example.com"),
        makeMember(reporterId, "Reporter", "reporter@example.com"),
      ],
    });

    (Task.findOne as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(taskId),
      title: "Implement comments",
      priority: "high",
      teamAssignment: {
        assigneeId: new Types.ObjectId(assigneeId),
        assignedBy: new Types.ObjectId(reporterId),
      },
    });

    (TeamTaskComment.create as jest.Mock).mockResolvedValue({
      _id: new Types.ObjectId(),
      teamId: new Types.ObjectId(teamId),
      taskId: new Types.ObjectId(taskId),
      authorId: new Types.ObjectId(requesterId),
      authorName: "Author",
      content: "Please review @assignee",
      mentionedUserIds: [new Types.ObjectId(assigneeId)],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await teamTaskCommentService.create(
      teamId,
      taskId,
      requesterId,
      "Please review @assignee",
    );

    const notifications = (notificationService.create as jest.Mock).mock.calls.map(
      (call) => call[0],
    );
    const commentNotifications = notifications.filter(
      (n) => n.type === NotificationType.TEAM_TASK_COMMENT,
    );
    const mentionNotifications = notifications.filter(
      (n) => n.type === NotificationType.TEAM_TASK_MENTION,
    );

    expect(commentNotifications).toEqual([
      expect.objectContaining({ userId: reporterId }),
    ]);
    expect(mentionNotifications).toEqual([
      expect.objectContaining({ userId: assigneeId }),
    ]);
  });
});
