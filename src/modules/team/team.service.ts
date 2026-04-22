import { Types } from "mongoose";
import { Team, TeamDoc, TeamMember, TeamRole, TeamType } from "./team.model";
import { TeamInvite } from "./team-invite.model";
import { Task } from "../task/task.model";
import { v4 as uuidv4 } from "uuid";
import { getRedis } from "../../services/redis.service";
import {
  getIndustry,
  isValidIndustry,
  isValidLevelForIndustry,
  isValidPosition,
  getPosition,
} from "../catalog/catalog.data";

export type CreateTeamDto = {
  name: string;
  description?: string;
  teamType?: TeamType;
  industry?: string;
};
export type UpdateTeamDto = {
  name?: string;
  description?: string;
  teamType?: TeamType;
  industry?: string;
};
export type UpdateMemberProfileDto = {
  position?: string | null;
  level?: string | null;
};
export type CreateTeamTaskDto = {
  title: string;
  status?: "todo" | "in_progress" | "completed" | "cancelled";
  assigneeId: string;
  startAt?: Date;
  deadline?: Date;
};

export type TeamPublic = {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  teamType: TeamType;
  industry?: string;
  members: {
    userId: string;
    email: string;
    name: string;
    avatar?: string;
    role: TeamRole;
    position?: string;
    level?: string;
    joinedAt: Date;
  }[];
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toPublic(doc: TeamDoc): TeamPublic {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description,
    ownerId: doc.ownerId.toString(),
    teamType: doc.teamType,
    industry: doc.industry,
    members: doc.members.map((m) => ({
      userId: m.userId.toString(),
      email: m.email,
      name: m.name,
      avatar: m.avatar,
      role: m.role,
      position: m.position,
      level: m.level,
      joinedAt: m.joinedAt,
    })),
    isArchived: doc.isArchived,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const invalidateTaskListCacheForUser = async (
  userId?: string,
): Promise<void> => {
  if (!userId) return;

  try {
    const redis = getRedis();
    const prefix = `tasks:user:${userId}`;
    const keys: string[] = [];

    let cursor = "0";
    do {
      const [next, batch] = await redis.scan(
        cursor,
        "MATCH",
        `${prefix}*`,
        "COUNT",
        200,
      );
      cursor = next;
      if (Array.isArray(batch) && batch.length) {
        keys.push(...batch);
      }
    } while (cursor !== "0");

    if (keys.length) {
      await redis.del(...keys);
    }
  } catch (_err) {
    return;
  }
};

export class TeamService {
  async createTeam(
    userId: string,
    userInfo: { email: string; name: string; avatar?: string },
    dto: CreateTeamDto,
  ): Promise<TeamPublic> {
    const teamType: TeamType =
      dto.teamType === "student" ? "student" : "company";

    let industry = dto.industry?.trim() || undefined;
    if (industry && !isValidIndustry(industry)) {
      throw { status: 400, message: "Ngành nghề không hợp lệ" };
    }

    const ownerMember: TeamMember = {
      userId: new Types.ObjectId(userId),
      email: userInfo.email,
      name: userInfo.name,
      avatar: userInfo.avatar,
      role: "owner",
      joinedAt: new Date(),
    };
    const team = await Team.create({
      name: dto.name,
      description: dto.description,
      ownerId: new Types.ObjectId(userId),
      members: [ownerMember],
      teamType,
      industry,
    });
    return toPublic(team);
  }

  async getTeam(teamId: string, userId: string): Promise<TeamPublic> {
    const team = await Team.findById(teamId);
    if (!team || team.isArchived)
      throw { status: 404, message: "Team không tồn tại" };
    const isMember = team.members.some((m) => m.userId.toString() === userId);
    if (!isMember)
      throw { status: 403, message: "Bạn không phải thành viên của team này" };
    return toPublic(team);
  }

  async listTeams(userId: string): Promise<TeamPublic[]> {
    const teams = await Team.find({
      "members.userId": new Types.ObjectId(userId),
      isArchived: false,
    });
    return teams.map(toPublic);
  }

  async updateTeam(
    teamId: string,
    userId: string,
    dto: UpdateTeamDto,
  ): Promise<TeamPublic> {
    const team = await Team.findById(teamId);
    if (!team) throw { status: 404, message: "Team không tồn tại" };
    const member = team.members.find((m) => m.userId.toString() === userId);
    if (!member || !["owner", "admin"].includes(member.role)) {
      throw { status: 403, message: "Không có quyền chỉnh sửa team" };
    }
    if (dto.name) team.name = dto.name;
    if (dto.description !== undefined) team.description = dto.description;
    if (dto.teamType) {
      if (dto.teamType !== "student" && dto.teamType !== "company") {
        throw { status: 400, message: "Loại nhóm không hợp lệ" };
      }
      team.teamType = dto.teamType;
    }
    if (dto.industry !== undefined) {
      const ind = dto.industry?.trim();
      if (ind && !isValidIndustry(ind)) {
        throw { status: 400, message: "Ngành nghề không hợp lệ" };
      }
      team.industry = ind || undefined;
    }
    await team.save();
    return toPublic(team);
  }

  async updateMemberProfile(
    teamId: string,
    requesterId: string,
    memberId: string,
    dto: UpdateMemberProfileDto,
  ): Promise<TeamPublic> {
    const team = await Team.findById(teamId);
    if (!team) throw { status: 404, message: "Team không tồn tại" };

    const requester = team.members.find(
      (m) => m.userId.toString() === requesterId,
    );
    if (!requester) {
      throw { status: 403, message: "Bạn không phải thành viên của team này" };
    }

    const isSelf = requesterId === memberId;
    const isAdminLike = ["owner", "admin"].includes(requester.role);
    if (!isSelf && !isAdminLike) {
      throw {
        status: 403,
        message:
          "Chỉ quản trị viên hoặc chính người đó mới được cập nhật vị trí / level",
      };
    }

    const target = team.members.find((m) => m.userId.toString() === memberId);
    if (!target) throw { status: 404, message: "Thành viên không tồn tại" };

    const industry = team.industry;

    if (dto.position !== undefined) {
      if (dto.position === null || dto.position === "") {
        target.position = undefined;
      } else {
        if (!industry) {
          throw {
            status: 400,
            message: "Team chưa chọn ngành nghề, không thể gán vị trí",
          };
        }
        if (!isValidPosition(industry, dto.position)) {
          throw {
            status: 400,
            message: "Vị trí không hợp lệ với ngành của team",
          };
        }
        target.position = dto.position;
        // Auto set level if missing
        if (!target.level) {
          const pos = getPosition(industry, dto.position);
          if (pos) target.level = pos.defaultLevel;
        }
      }
    }

    if (dto.level !== undefined) {
      if (dto.level === null || dto.level === "") {
        target.level = undefined;
      } else {
        if (!isValidLevelForIndustry(industry, dto.level)) {
          throw {
            status: 400,
            message: "Level không hợp lệ với ngành của team",
          };
        }
        target.level = dto.level;
      }
    }

    team.markModified("members");
    await team.save();
    return toPublic(team);
  }

  async deleteTeam(teamId: string, userId: string): Promise<void> {
    const team = await Team.findById(teamId);
    if (!team) throw { status: 404, message: "Team không tồn tại" };
    if (team.ownerId.toString() !== userId)
      throw { status: 403, message: "Chỉ owner mới có thể xóa team" };
    team.isArchived = true;
    await team.save();
  }

  async removeMember(
    teamId: string,
    requesterId: string,
    memberId: string,
  ): Promise<TeamPublic> {
    const team = await Team.findById(teamId);
    if (!team) throw { status: 404, message: "Team không tồn tại" };
    const requester = team.members.find(
      (m) => m.userId.toString() === requesterId,
    );
    if (!requester || !["owner", "admin"].includes(requester.role)) {
      throw { status: 403, message: "Không có quyền xóa thành viên" };
    }
    const target = team.members.find((m) => m.userId.toString() === memberId);
    if (!target) throw { status: 404, message: "Thành viên không tồn tại" };
    if (target.role === "owner")
      throw { status: 400, message: "Không thể xóa owner khỏi team" };
    team.members = team.members.filter((m) => m.userId.toString() !== memberId);
    await team.save();
    return toPublic(team);
  }

  async updateMemberRole(
    teamId: string,
    requesterId: string,
    memberId: string,
    role: TeamRole,
  ): Promise<TeamPublic> {
    const team = await Team.findById(teamId);
    if (!team) throw { status: 404, message: "Team không tồn tại" };
    if (team.ownerId.toString() !== requesterId)
      throw { status: 403, message: "Chỉ owner mới có thể đổi role" };
    if (role === "owner")
      throw { status: 400, message: "Không thể đặt role owner" };
    const member = team.members.find((m) => m.userId.toString() === memberId);
    if (!member) throw { status: 404, message: "Thành viên không tồn tại" };
    if (member.role === "owner")
      throw { status: 400, message: "Không thể đổi role của owner" };
    member.role = role;
    await team.save();
    return toPublic(team);
  }

  async getMemberWorkload(teamId: string, memberId: string) {
    const tasks = await Task.find({
      "teamAssignment.teamId": new Types.ObjectId(teamId),
      "teamAssignment.assigneeId": new Types.ObjectId(memberId),
      isArchived: false,
    });
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const scheduledMinutes = tasks
      .filter(
        (t) =>
          t.scheduledTime?.start &&
          t.scheduledTime.start >= now &&
          t.scheduledTime.start <= in7Days,
      )
      .reduce((sum, t) => sum + (t.estimatedDuration || 0), 0);
    return {
      totalTasks: tasks.length,
      completedTasks: tasks.filter((t) => t.status === "completed").length,
      inProgressTasks: tasks.filter((t) => t.status === "in_progress").length,
      totalEstimatedMinutes: tasks.reduce(
        (sum, t) => sum + (t.estimatedDuration || 0),
        0,
      ),
      scheduledMinutes,
    };
  }

  async getTeamBoard(teamId: string) {
    const tasks = await Task.find({
      "teamAssignment.teamId": new Types.ObjectId(teamId),
      isArchived: false,
    }).lean();
    return {
      todo: tasks.filter((t) => t.status === "todo"),
      in_progress: tasks.filter((t) => t.status === "in_progress"),
      completed: tasks.filter((t) => t.status === "completed"),
    };
  }

  async assignTask(
    teamId: string,
    taskId: string,
    assigneeId: string,
    assignerId: string,
  ) {
    const team = await Team.findById(teamId);
    if (!team) throw { status: 404, message: "Team không tồn tại" };
    const assignee = team.members.find(
      (m) => m.userId.toString() === assigneeId,
    );
    if (!assignee)
      throw {
        status: 400,
        message: "Người được giao không phải thành viên team",
      };
    const task = await Task.findById(taskId);
    if (!task) throw { status: 404, message: "Task không tồn tại" };
    const previousUserId = task.userId?.toString();
    task.teamAssignment = {
      teamId: new Types.ObjectId(teamId),
      assigneeId: new Types.ObjectId(assigneeId),
      assigneeEmail: assignee.email,
      assigneeName: assignee.name,
      assignedBy: new Types.ObjectId(assignerId),
      assignedAt: new Date(),
    };
    task.userId = new Types.ObjectId(assigneeId);
    await task.save();
    await Promise.all([
      invalidateTaskListCacheForUser(previousUserId),
      invalidateTaskListCacheForUser(assigneeId),
    ]);
    return task;
  }

  async createTeamTask(
    teamId: string,
    requesterId: string,
    dto: CreateTeamTaskDto,
  ) {
    const team = await Team.findById(teamId);
    if (!team || team.isArchived)
      throw { status: 404, message: "Team không tồn tại" };

    const requester = team.members.find(
      (m) => m.userId.toString() === requesterId,
    );
    if (!requester)
      throw { status: 403, message: "Bạn không phải thành viên của team này" };

    const title = String(dto.title || "").trim();
    if (!title) throw { status: 400, message: "Tên công việc không hợp lệ" };

    if (!Types.ObjectId.isValid(dto.assigneeId)) {
      throw { status: 400, message: "Người thực hiện không hợp lệ" };
    }

    const assignee = team.members.find(
      (m) => m.userId.toString() === dto.assigneeId,
    );
    if (!assignee) {
      throw {
        status: 400,
        message: "Người thực hiện không phải thành viên team",
      };
    }

    const task = await Task.create({
      title,
      status: dto.status || "todo",
      priority: "medium",
      deadline: dto.deadline,
      userId: new Types.ObjectId(dto.assigneeId),
      teamAssignment: {
        teamId: new Types.ObjectId(teamId),
        assigneeId: new Types.ObjectId(dto.assigneeId),
        assigneeEmail: assignee.email,
        assigneeName: assignee.name,
        assignedBy: new Types.ObjectId(requesterId),
        assignedAt: new Date(),
        startAt: dto.startAt,
      },
    });

    await invalidateTaskListCacheForUser(dto.assigneeId);

    return task;
  }

  async unassignTask(taskId: string) {
    const task = await Task.findById(taskId);
    if (!task) throw { status: 404, message: "Task không tồn tại" };
    task.teamAssignment = undefined;
    await task.save();
    await invalidateTaskListCacheForUser(task.userId?.toString());
    return task;
  }

  async getTeamTasks(
    teamId: string,
    filters: {
      status?: string;
      assigneeId?: string;
      priority?: string;
      reporterId?: string;
      keyword?: string;
      startFrom?: string;
      startTo?: string;
      deadlineFrom?: string;
      deadlineTo?: string;
    },
  ) {
    const query: any = {
      "teamAssignment.teamId": new Types.ObjectId(teamId),
      isArchived: false,
    };
    if (filters.status) query.status = filters.status;
    if (filters.assigneeId)
      query["teamAssignment.assigneeId"] = new Types.ObjectId(
        filters.assigneeId,
      );
    if (filters.priority) query.priority = filters.priority;

    if (filters.reporterId) {
      query["teamAssignment.assignedBy"] = new Types.ObjectId(
        filters.reporterId,
      );
    }

    if (filters.keyword) {
      query.title = { $regex: filters.keyword.trim(), $options: "i" };
    }

    if (filters.startFrom || filters.startTo) {
      const startRange = {
        ...(filters.startFrom ? { $gte: new Date(filters.startFrom) } : {}),
        ...(filters.startTo ? { $lte: new Date(filters.startTo) } : {}),
      };

      query.$or = [
        { "teamAssignment.startAt": startRange },
        { "scheduledTime.start": startRange },
      ];
    }

    if (filters.deadlineFrom || filters.deadlineTo) {
      query.deadline = {
        ...(filters.deadlineFrom
          ? { $gte: new Date(filters.deadlineFrom) }
          : {}),
        ...(filters.deadlineTo ? { $lte: new Date(filters.deadlineTo) } : {}),
      };
    }

    return Task.find(query).lean();
  }

  async getTeamCalendar(teamId: string, from: Date, to: Date) {
    const tasks = await Task.find({
      "teamAssignment.teamId": new Types.ObjectId(teamId),
      "scheduledTime.start": { $gte: from, $lte: to },
      isArchived: false,
    }).lean();
    const byMember: Record<string, any[]> = {};
    for (const task of tasks) {
      const key = task.teamAssignment!.assigneeId.toString();
      if (!byMember[key]) byMember[key] = [];
      byMember[key].push(task);
    }
    return byMember;
  }

  async detectConflicts(teamId: string, from: Date, to: Date) {
    const tasks = await Task.find({
      "teamAssignment.teamId": new Types.ObjectId(teamId),
      "scheduledTime.start": { $gte: from, $lte: to },
      isArchived: false,
    }).lean();
    const conflicts: any[] = [];
    const byMember: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      const key = task.teamAssignment!.assigneeId.toString();
      if (!byMember[key]) byMember[key] = [];
      byMember[key].push(task);
    }
    for (const [memberId, memberTasks] of Object.entries(byMember)) {
      const sorted = memberTasks.sort(
        (a, b) =>
          new Date(a.scheduledTime!.start).getTime() -
          new Date(b.scheduledTime!.start).getTime(),
      );
      for (let i = 0; i < sorted.length - 1; i++) {
        const endA = new Date(sorted[i].scheduledTime!.end);
        const startB = new Date(sorted[i + 1].scheduledTime!.start);
        if (endA > startB) {
          conflicts.push({
            type: "overlap",
            memberId,
            task1: sorted[i].title,
            task2: sorted[i + 1].title,
          });
        }
      }
    }
    return conflicts;
  }
}

export const teamService = new TeamService();
