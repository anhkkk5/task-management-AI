"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teamService = exports.TeamService = void 0;
const mongoose_1 = require("mongoose");
const team_model_1 = require("./team.model");
const task_model_1 = require("../task/task.model");
const redis_service_1 = require("../../services/redis.service");
const catalog_data_1 = require("../catalog/catalog.data");
const task_service_1 = require("../task/task.service");
const notification_service_1 = require("../notification/notification.service");
const notification_model_1 = require("../notification/notification.model");
const chat_gateway_1 = require("../chat/chat.gateway");
const STUDENT_MANAGER_ROLES = [
    "owner",
    "admin",
    "student_leader",
    "lecturer_leader",
];
const COMPANY_MANAGER_ROLES = ["owner", "admin"];
function canManageTeam(teamType, role) {
    const roles = teamType === "student" ? STUDENT_MANAGER_ROLES : COMPANY_MANAGER_ROLES;
    return roles.includes(role);
}
function isRoleAllowedForTeamType(teamType, role) {
    if (role === "owner")
        return true;
    if (teamType === "student") {
        return [
            "admin",
            "student_leader",
            "lecturer_leader",
            "member",
            "viewer",
        ].includes(role);
    }
    return ["admin", "member", "viewer"].includes(role);
}
function toPublic(doc) {
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
async function regenerateAssigneeBreakdowns(teamId, assigneeId) {
    try {
        const tasks = await task_model_1.Task.find({
            "teamAssignment.teamId": new mongoose_1.Types.ObjectId(teamId),
            "teamAssignment.assigneeId": new mongoose_1.Types.ObjectId(assigneeId),
            isArchived: false,
            status: { $in: ["todo", "scheduled", "in_progress"] },
        })
            .select({ _id: 1, userId: 1 })
            .lean();
        for (const t of tasks) {
            try {
                await task_service_1.taskService.aiBreakdown(String(t.userId), String(t._id));
            }
            catch (err) {
                console.warn(`[Team] regenerate breakdown failed for task ${String(t._id)}: ${err?.message || err}`);
            }
        }
    }
    catch (err) {
        console.warn(`[Team] regenerate assignee breakdowns failed: ${err?.message || err}`);
    }
}
const invalidateTaskListCacheForUser = async (userId) => {
    if (!userId)
        return;
    try {
        const redis = (0, redis_service_1.getRedis)();
        const prefix = `tasks:user:${userId}`;
        const keys = [];
        let cursor = "0";
        do {
            const [next, batch] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
            cursor = next;
            if (Array.isArray(batch) && batch.length) {
                keys.push(...batch);
            }
        } while (cursor !== "0");
        if (keys.length) {
            await redis.del(...keys);
        }
    }
    catch (_err) {
        return;
    }
};
const emitTeamTaskChanged = (params) => {
    const chatGateway = (0, chat_gateway_1.getChatGateway)();
    if (!chatGateway)
        return;
    const payload = {
        teamId: params.teamId,
        taskId: params.taskId,
        action: params.action,
        actorId: params.actorId,
        at: new Date().toISOString(),
    };
    for (const member of params.team.members) {
        chatGateway.emitToUser(String(member.userId), "team:task:changed", payload);
    }
};
const notifyTeamTask = async (params) => {
    try {
        await notification_service_1.notificationService.create({
            userId: params.userId,
            type: params.type,
            title: params.title,
            content: params.content,
            channels: {
                inApp: true,
                email: true,
            },
            data: {
                taskId: params.taskId,
                teamId: params.teamId,
                taskPriority: params.taskPriority,
                actorId: params.actorId,
                actorName: params.actorName,
                actions: params.actions || [],
            },
        });
    }
    catch (err) {
        console.error("[TeamService] Failed to create team notification:", err);
    }
};
class TeamService {
    async getTeamAndMember(teamId, userId) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team || team.isArchived) {
            throw { status: 404, message: "Team không tồn tại" };
        }
        const member = team.members.find((m) => m.userId.toString() === userId);
        if (!member) {
            throw { status: 403, message: "Bạn không phải thành viên của team này" };
        }
        return { team, member };
    }
    canManageTeamTask(task, team, requesterId) {
        const assignedBy = String(task?.teamAssignment?.assignedBy ?? "");
        return (team.ownerId.toString() === requesterId || assignedBy === requesterId);
    }
    async createTeam(userId, userInfo, dto) {
        const teamType = dto.teamType === "student" ? "student" : "company";
        let industry = dto.industry?.trim() || undefined;
        if (industry && !(0, catalog_data_1.isValidIndustry)(industry)) {
            throw { status: 400, message: "Ngành nghề không hợp lệ" };
        }
        const ownerMember = {
            userId: new mongoose_1.Types.ObjectId(userId),
            email: userInfo.email,
            name: userInfo.name,
            avatar: userInfo.avatar,
            role: "owner",
            joinedAt: new Date(),
        };
        const team = await team_model_1.Team.create({
            name: dto.name,
            description: dto.description,
            ownerId: new mongoose_1.Types.ObjectId(userId),
            members: [ownerMember],
            teamType,
            industry,
        });
        return toPublic(team);
    }
    async getTeam(teamId, userId) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team || team.isArchived)
            throw { status: 404, message: "Team không tồn tại" };
        const isMember = team.members.some((m) => m.userId.toString() === userId);
        if (!isMember)
            throw { status: 403, message: "Bạn không phải thành viên của team này" };
        return toPublic(team);
    }
    async listTeams(userId) {
        const teams = await team_model_1.Team.find({
            "members.userId": new mongoose_1.Types.ObjectId(userId),
            isArchived: false,
        });
        return teams.map(toPublic);
    }
    async updateTeam(teamId, userId, dto) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team)
            throw { status: 404, message: "Team không tồn tại" };
        if (team.ownerId.toString() !== userId) {
            throw { status: 403, message: "Chỉ owner mới có quyền chỉnh sửa team" };
        }
        if (dto.name)
            team.name = dto.name;
        if (dto.description !== undefined)
            team.description = dto.description;
        if (dto.teamType) {
            if (dto.teamType !== "student" && dto.teamType !== "company") {
                throw { status: 400, message: "Loại nhóm không hợp lệ" };
            }
            team.teamType = dto.teamType;
        }
        if (dto.industry !== undefined) {
            const ind = dto.industry?.trim();
            if (ind && !(0, catalog_data_1.isValidIndustry)(ind)) {
                throw { status: 400, message: "Ngành nghề không hợp lệ" };
            }
            team.industry = ind || undefined;
        }
        await team.save();
        return toPublic(team);
    }
    async updateMemberProfile(teamId, requesterId, memberId, dto) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team)
            throw { status: 404, message: "Team không tồn tại" };
        const requester = team.members.find((m) => m.userId.toString() === requesterId);
        if (!requester) {
            throw { status: 403, message: "Bạn không phải thành viên của team này" };
        }
        const isSelf = requesterId === memberId;
        const isAdminLike = canManageTeam(team.teamType, requester.role);
        if (!isSelf && !isAdminLike) {
            throw {
                status: 403,
                message: "Chỉ quản trị viên hoặc chính người đó mới được cập nhật vị trí / level",
            };
        }
        const target = team.members.find((m) => m.userId.toString() === memberId);
        if (!target)
            throw { status: 404, message: "Thành viên không tồn tại" };
        const industry = team.industry;
        const beforePosition = target.position;
        const beforeLevel = target.level;
        if (dto.position !== undefined) {
            if (dto.position === null || dto.position === "") {
                target.position = undefined;
            }
            else {
                if (!industry) {
                    throw {
                        status: 400,
                        message: "Team chưa chọn ngành nghề, không thể gán vị trí",
                    };
                }
                if (!(0, catalog_data_1.isValidPosition)(industry, dto.position)) {
                    throw {
                        status: 400,
                        message: "Vị trí không hợp lệ với ngành của team",
                    };
                }
                target.position = dto.position;
                // Auto set level if missing
                if (!target.level) {
                    const pos = (0, catalog_data_1.getPosition)(industry, dto.position);
                    if (pos)
                        target.level = pos.defaultLevel;
                }
            }
        }
        if (dto.level !== undefined) {
            if (dto.level === null || dto.level === "") {
                target.level = undefined;
            }
            else {
                if (!(0, catalog_data_1.isValidLevelForIndustry)(industry, dto.level)) {
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
        const profileChanged = beforePosition !== target.position || beforeLevel !== target.level;
        if (profileChanged) {
            void regenerateAssigneeBreakdowns(teamId, memberId);
        }
        return toPublic(team);
    }
    async deleteTeam(teamId, userId) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team)
            throw { status: 404, message: "Team không tồn tại" };
        if (team.ownerId.toString() !== userId)
            throw { status: 403, message: "Chỉ owner mới có thể xóa team" };
        team.isArchived = true;
        await team.save();
    }
    async removeMember(teamId, requesterId, memberId) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team)
            throw { status: 404, message: "Team không tồn tại" };
        const requester = team.members.find((m) => m.userId.toString() === requesterId);
        if (!requester || !canManageTeam(team.teamType, requester.role)) {
            throw { status: 403, message: "Không có quyền xóa thành viên" };
        }
        const target = team.members.find((m) => m.userId.toString() === memberId);
        if (!target)
            throw { status: 404, message: "Thành viên không tồn tại" };
        if (target.role === "owner")
            throw { status: 400, message: "Không thể xóa owner khỏi team" };
        team.members = team.members.filter((m) => m.userId.toString() !== memberId);
        await team.save();
        return toPublic(team);
    }
    async updateMemberRole(teamId, requesterId, memberId, role) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team)
            throw { status: 404, message: "Team không tồn tại" };
        if (team.ownerId.toString() !== requesterId)
            throw { status: 403, message: "Chỉ owner mới có thể đổi role" };
        if (role === "owner")
            throw { status: 400, message: "Không thể đặt role owner" };
        if (!isRoleAllowedForTeamType(team.teamType, role)) {
            throw {
                status: 400,
                message: team.teamType === "student"
                    ? "Role không hợp lệ cho nhóm sinh viên"
                    : "Role không hợp lệ cho nhóm công ty",
            };
        }
        const member = team.members.find((m) => m.userId.toString() === memberId);
        if (!member)
            throw { status: 404, message: "Thành viên không tồn tại" };
        if (member.role === "owner")
            throw { status: 400, message: "Không thể đổi role của owner" };
        member.role = role;
        await team.save();
        return toPublic(team);
    }
    async getMemberWorkload(teamId, memberId) {
        const tasks = await task_model_1.Task.find({
            "teamAssignment.teamId": new mongoose_1.Types.ObjectId(teamId),
            "teamAssignment.assigneeId": new mongoose_1.Types.ObjectId(memberId),
            isArchived: false,
        });
        const now = new Date();
        const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const scheduledMinutes = tasks
            .filter((t) => t.scheduledTime?.start &&
            t.scheduledTime.start >= now &&
            t.scheduledTime.start <= in7Days)
            .reduce((sum, t) => sum + (t.estimatedDuration || 0), 0);
        return {
            totalTasks: tasks.length,
            completedTasks: tasks.filter((t) => t.status === "completed").length,
            inProgressTasks: tasks.filter((t) => t.status === "in_progress").length,
            totalEstimatedMinutes: tasks.reduce((sum, t) => sum + (t.estimatedDuration || 0), 0),
            scheduledMinutes,
        };
    }
    async getTeamBoard(teamId) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team || team.isArchived)
            throw { status: 404, message: "Team không tồn tại" };
        const tasks = await task_model_1.Task.find({
            "teamAssignment.teamId": new mongoose_1.Types.ObjectId(teamId),
            isArchived: false,
        }).lean();
        return {
            todo: tasks.filter((t) => t.status === "todo"),
            scheduled: tasks.filter((t) => t.status === "scheduled"),
            in_progress: tasks.filter((t) => t.status === "in_progress"),
            completed: tasks.filter((t) => t.status === "completed"),
            cancelled: tasks.filter((t) => t.status === "cancelled"),
        };
    }
    async assignTask(teamId, taskId, assigneeId, assignerId) {
        const { team } = await this.getTeamAndMember(teamId, assignerId);
        const assignee = team.members.find((m) => m.userId.toString() === assigneeId);
        if (!assignee)
            throw {
                status: 400,
                message: "Người được giao không phải thành viên team",
            };
        const task = await task_model_1.Task.findById(taskId);
        if (!task)
            throw { status: 404, message: "Task không tồn tại" };
        const previousUserId = task.userId?.toString();
        task.teamAssignment = {
            teamId: new mongoose_1.Types.ObjectId(teamId),
            assigneeId: new mongoose_1.Types.ObjectId(assigneeId),
            assigneeEmail: assignee.email,
            assigneeName: assignee.name,
            assignedBy: new mongoose_1.Types.ObjectId(assignerId),
            assignedAt: new Date(),
        };
        task.userId = new mongoose_1.Types.ObjectId(assigneeId);
        await task.save();
        await Promise.all([
            invalidateTaskListCacheForUser(previousUserId),
            invalidateTaskListCacheForUser(assigneeId),
        ]);
        const assignerName = team.members.find((m) => m.userId.toString() === assignerId)?.name ||
            "Thành viên nhóm";
        const reassigned = Boolean(previousUserId && previousUserId !== assigneeId);
        if (assigneeId !== assignerId) {
            await notifyTeamTask({
                userId: assigneeId,
                type: reassigned
                    ? notification_model_1.NotificationType.TEAM_TASK_REASSIGNED
                    : notification_model_1.NotificationType.TEAM_TASK_ASSIGNED,
                title: reassigned
                    ? `Bạn được chuyển phụ trách task: ${task.title}`
                    : `Bạn được giao task mới: ${task.title}`,
                content: `${assignerName} đã giao cho bạn công việc "${task.title}" trong team ${team.name}.`,
                taskId: String(task._id),
                teamId,
                taskPriority: task.priority,
                actorId: assignerId,
                actorName: assignerName,
                actions: [
                    {
                        key: "open-task",
                        label: "Mở task",
                        action: "open_task",
                        style: "primary",
                        payload: { taskId: String(task._id), teamId },
                    },
                    {
                        key: "mark-in-progress",
                        label: "Bắt đầu ngay",
                        action: "start_task",
                        payload: { taskId: String(task._id), teamId },
                    },
                ],
            });
        }
        emitTeamTaskChanged({
            team,
            teamId,
            taskId: String(task._id),
            action: "assigned",
            actorId: assignerId,
        });
        return task;
    }
    async createTeamTask(teamId, requesterId, dto) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team || team.isArchived)
            throw { status: 404, message: "Team không tồn tại" };
        const requester = team.members.find((m) => m.userId.toString() === requesterId);
        if (!requester)
            throw { status: 403, message: "Bạn không phải thành viên của team này" };
        const title = String(dto.title || "").trim();
        const description = dto.description
            ? String(dto.description).trim() || undefined
            : undefined;
        const priority = dto.priority || "medium";
        if (!title)
            throw { status: 400, message: "Tên công việc không hợp lệ" };
        if (!["low", "medium", "high", "urgent"].includes(priority)) {
            throw { status: 400, message: "Độ ưu tiên không hợp lệ" };
        }
        if (!mongoose_1.Types.ObjectId.isValid(dto.assigneeId)) {
            throw { status: 400, message: "Người thực hiện không hợp lệ" };
        }
        const assignee = team.members.find((m) => m.userId.toString() === dto.assigneeId);
        if (!assignee) {
            throw {
                status: 400,
                message: "Người thực hiện không phải thành viên team",
            };
        }
        const task = await task_model_1.Task.create({
            title,
            description,
            status: dto.status || "todo",
            priority,
            deadline: dto.deadline,
            userId: new mongoose_1.Types.ObjectId(dto.assigneeId),
            teamAssignment: {
                teamId: new mongoose_1.Types.ObjectId(teamId),
                assigneeId: new mongoose_1.Types.ObjectId(dto.assigneeId),
                assigneeEmail: assignee.email,
                assigneeName: assignee.name,
                assignedBy: new mongoose_1.Types.ObjectId(requesterId),
                assignedAt: new Date(),
                startAt: dto.startAt,
            },
        });
        await invalidateTaskListCacheForUser(dto.assigneeId);
        if (dto.assigneeId !== requesterId) {
            await notifyTeamTask({
                userId: dto.assigneeId,
                type: notification_model_1.NotificationType.TEAM_TASK_ASSIGNED,
                title: `Bạn được giao task mới: ${title}`,
                content: `${requester.name} đã tạo và giao cho bạn công việc "${title}" trong team ${team.name}.`,
                taskId: String(task._id),
                teamId,
                taskPriority: priority,
                actorId: requesterId,
                actorName: requester.name,
                actions: [
                    {
                        key: "open-task",
                        label: "Xem task",
                        action: "open_task",
                        style: "primary",
                        payload: { taskId: String(task._id), teamId },
                    },
                ],
            });
        }
        emitTeamTaskChanged({
            team,
            teamId,
            taskId: String(task._id),
            action: "created",
            actorId: requesterId,
        });
        return task;
    }
    async unassignTask(teamId, taskId, requesterId) {
        const { team } = await this.getTeamAndMember(teamId, requesterId);
        const task = await task_model_1.Task.findById(taskId);
        if (!task)
            throw { status: 404, message: "Task không tồn tại" };
        if (String(task?.teamAssignment?.teamId ?? "") !== String(teamId)) {
            throw { status: 400, message: "Task không thuộc team này" };
        }
        if (!this.canManageTeamTask(task, team, requesterId)) {
            throw {
                status: 403,
                message: "Chỉ người giao việc hoặc owner mới có thể bỏ phân công",
            };
        }
        task.teamAssignment = undefined;
        await task.save();
        await invalidateTaskListCacheForUser(task.userId?.toString());
        emitTeamTaskChanged({
            team,
            teamId,
            taskId: String(task._id),
            action: "unassigned",
            actorId: requesterId,
        });
        return task;
    }
    async getTeamTasks(teamId, requesterId, filters) {
        await this.getTeamAndMember(teamId, requesterId);
        const query = {
            "teamAssignment.teamId": new mongoose_1.Types.ObjectId(teamId),
            isArchived: false,
        };
        if (filters.status)
            query.status = filters.status;
        if (filters.assigneeId)
            query["teamAssignment.assigneeId"] = new mongoose_1.Types.ObjectId(filters.assigneeId);
        if (filters.priority)
            query.priority = filters.priority;
        if (filters.reporterId) {
            query["teamAssignment.assignedBy"] = new mongoose_1.Types.ObjectId(filters.reporterId);
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
        return task_model_1.Task.find(query).lean();
    }
    async updateTeamTask(teamId, taskId, requesterId, dto) {
        const { team } = await this.getTeamAndMember(teamId, requesterId);
        const task = await task_model_1.Task.findById(taskId);
        if (!task || task.isArchived) {
            throw { status: 404, message: "Task không tồn tại" };
        }
        if (String(task?.teamAssignment?.teamId ?? "") !== String(teamId)) {
            throw { status: 400, message: "Task không thuộc team này" };
        }
        if (!this.canManageTeamTask(task, team, requesterId)) {
            throw {
                status: 403,
                message: "Chỉ người giao việc hoặc owner mới có thể sửa task",
            };
        }
        if (dto.title !== undefined) {
            const title = String(dto.title).trim();
            if (!title)
                throw { status: 400, message: "Tên công việc không hợp lệ" };
            task.title = title;
        }
        if (dto.description !== undefined) {
            const desc = String(dto.description).trim();
            task.description = desc || undefined;
        }
        if (dto.priority !== undefined) {
            if (!["low", "medium", "high", "urgent"].includes(dto.priority)) {
                throw { status: 400, message: "Độ ưu tiên không hợp lệ" };
            }
            task.priority = dto.priority;
        }
        const previousStatus = String(task.status || "");
        const previousAssigneeId = String(task.userId || "");
        let changedFields = [];
        if (dto.status !== undefined) {
            task.status = dto.status;
            changedFields.push("trạng thái");
        }
        if (dto.deadline !== undefined) {
            task.deadline = dto.deadline;
            changedFields.push("deadline");
        }
        if (dto.startAt !== undefined && task.teamAssignment) {
            task.teamAssignment.startAt = dto.startAt;
            changedFields.push("thời gian bắt đầu");
        }
        if (dto.assigneeId !== undefined) {
            if (!mongoose_1.Types.ObjectId.isValid(dto.assigneeId)) {
                throw { status: 400, message: "Người thực hiện không hợp lệ" };
            }
            const assignee = team.members.find((m) => m.userId.toString() === dto.assigneeId);
            if (!assignee) {
                throw {
                    status: 400,
                    message: "Người thực hiện không phải thành viên team",
                };
            }
            const previousUserId = task.userId?.toString();
            task.userId = new mongoose_1.Types.ObjectId(dto.assigneeId);
            if (task.teamAssignment) {
                task.teamAssignment.assigneeId = new mongoose_1.Types.ObjectId(dto.assigneeId);
                task.teamAssignment.assigneeEmail = assignee.email;
                task.teamAssignment.assigneeName = assignee.name;
            }
            await Promise.all([
                invalidateTaskListCacheForUser(previousUserId),
                invalidateTaskListCacheForUser(dto.assigneeId),
            ]);
            changedFields.push("người thực hiện");
        }
        if (dto.title !== undefined)
            changedFields.push("tiêu đề");
        if (dto.description !== undefined)
            changedFields.push("mô tả");
        if (dto.priority !== undefined)
            changedFields.push("độ ưu tiên");
        await task.save();
        await invalidateTaskListCacheForUser(task.userId?.toString());
        const requesterName = team.members.find((m) => m.userId.toString() === requesterId)?.name ||
            "Thành viên nhóm";
        const currentAssigneeId = String(task.userId || "");
        if (dto.assigneeId && dto.assigneeId !== previousAssigneeId) {
            if (dto.assigneeId !== requesterId) {
                await notifyTeamTask({
                    userId: dto.assigneeId,
                    type: notification_model_1.NotificationType.TEAM_TASK_REASSIGNED,
                    title: `Task được chuyển cho bạn: ${task.title}`,
                    content: `${requesterName} đã chuyển công việc "${task.title}" cho bạn trong team ${team.name}.`,
                    taskId: String(task._id),
                    teamId,
                    taskPriority: task.priority,
                    actorId: requesterId,
                    actorName: requesterName,
                    actions: [
                        {
                            key: "open-task",
                            label: "Mở task",
                            action: "open_task",
                            style: "primary",
                            payload: { taskId: String(task._id), teamId },
                        },
                    ],
                });
            }
            if (previousAssigneeId && previousAssigneeId !== requesterId) {
                await notifyTeamTask({
                    userId: previousAssigneeId,
                    type: notification_model_1.NotificationType.TEAM_TASK_REASSIGNED,
                    title: `Task đã được chuyển người phụ trách: ${task.title}`,
                    content: `${requesterName} đã chuyển công việc "${task.title}" cho người khác.`,
                    taskId: String(task._id),
                    teamId,
                    taskPriority: task.priority,
                    actorId: requesterId,
                    actorName: requesterName,
                });
            }
        }
        else if (changedFields.length > 0 &&
            currentAssigneeId &&
            currentAssigneeId !== requesterId) {
            await notifyTeamTask({
                userId: currentAssigneeId,
                type: notification_model_1.NotificationType.TEAM_TASK_UPDATED,
                title: `Task được cập nhật: ${task.title}`,
                content: `${requesterName} vừa cập nhật ${changedFields.join(", ")} cho công việc "${task.title}".`,
                taskId: String(task._id),
                teamId,
                taskPriority: task.priority,
                actorId: requesterId,
                actorName: requesterName,
            });
        }
        if (previousStatus !== String(task.status || "") &&
            currentAssigneeId &&
            currentAssigneeId !== requesterId) {
            await notifyTeamTask({
                userId: currentAssigneeId,
                type: notification_model_1.NotificationType.TEAM_TASK_STATUS_CHANGED,
                title: `Trạng thái task thay đổi: ${task.title}`,
                content: `${requesterName} đã đổi trạng thái công việc từ "${previousStatus}" sang "${String(task.status)}".`,
                taskId: String(task._id),
                teamId,
                taskPriority: task.priority,
                actorId: requesterId,
                actorName: requesterName,
            });
        }
        emitTeamTaskChanged({
            team,
            teamId,
            taskId: String(task._id),
            action: "updated",
            actorId: requesterId,
        });
        return task;
    }
    async updateTeamTaskStatus(teamId, taskId, requesterId, status) {
        const { team } = await this.getTeamAndMember(teamId, requesterId);
        const task = await task_model_1.Task.findById(taskId);
        if (!task || task.isArchived) {
            throw { status: 404, message: "Task không tồn tại" };
        }
        if (String(task?.teamAssignment?.teamId ?? "") !== String(teamId)) {
            throw { status: 400, message: "Task không thuộc team này" };
        }
        const assigneeId = String(task?.teamAssignment?.assigneeId ?? "");
        const assignedBy = String(task?.teamAssignment?.assignedBy ?? "");
        if (status === "scheduled" && assigneeId !== requesterId) {
            throw {
                status: 403,
                message: "Trạng thái đã lên lịch là lịch cá nhân, chỉ người được giao task mới được cập nhật",
            };
        }
        const previousStatus = String(task.status || "");
        task.status = status;
        await task.save();
        await invalidateTaskListCacheForUser(task.userId?.toString());
        const requesterName = team.members.find((m) => m.userId.toString() === requesterId)?.name ||
            "Thành viên nhóm";
        const notifyUserIds = new Set();
        if (assigneeId)
            notifyUserIds.add(assigneeId);
        if (assignedBy)
            notifyUserIds.add(assignedBy);
        notifyUserIds.delete(requesterId);
        await Promise.all([...notifyUserIds].map((targetUserId) => notifyTeamTask({
            userId: targetUserId,
            type: notification_model_1.NotificationType.TEAM_TASK_STATUS_CHANGED,
            title: `Trạng thái task thay đổi: ${task.title}`,
            content: `${requesterName} đã cập nhật trạng thái công việc "${task.title}" từ "${previousStatus}" sang "${status}".`,
            taskId: String(task._id),
            teamId,
            taskPriority: task.priority,
            actorId: requesterId,
            actorName: requesterName,
            actions: [
                {
                    key: "open-task",
                    label: "Xem chi tiết",
                    action: "open_task",
                    style: "primary",
                    payload: { taskId: String(task._id), teamId },
                },
            ],
        })));
        emitTeamTaskChanged({
            team,
            teamId,
            taskId: String(task._id),
            action: "status_changed",
            actorId: requesterId,
        });
        return task;
    }
    async deleteTeamTask(teamId, taskId, requesterId) {
        const { team } = await this.getTeamAndMember(teamId, requesterId);
        const task = await task_model_1.Task.findById(taskId);
        if (!task || task.isArchived) {
            throw { status: 404, message: "Task không tồn tại" };
        }
        if (String(task?.teamAssignment?.teamId ?? "") !== String(teamId)) {
            throw { status: 400, message: "Task không thuộc team này" };
        }
        if (!this.canManageTeamTask(task, team, requesterId)) {
            throw {
                status: 403,
                message: "Chỉ người giao việc hoặc owner mới có thể xóa task",
            };
        }
        const deletedUserId = task.userId?.toString();
        const deletedTaskId = String(task._id);
        await task_model_1.Task.deleteOne({ _id: task._id });
        await invalidateTaskListCacheForUser(deletedUserId);
        emitTeamTaskChanged({
            team,
            teamId,
            taskId: deletedTaskId,
            action: "deleted",
            actorId: requesterId,
        });
        return { message: "Đã xóa công việc nhóm" };
    }
    async getTeamCalendar(teamId, from, to) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team || team.isArchived)
            throw { status: 404, message: "Team không tồn tại" };
        const tasks = await task_model_1.Task.find({
            "teamAssignment.teamId": new mongoose_1.Types.ObjectId(teamId),
            "scheduledTime.start": { $gte: from, $lte: to },
            isArchived: false,
        }).lean();
        const byMember = {};
        for (const task of tasks) {
            const key = task.teamAssignment.assigneeId.toString();
            if (!byMember[key])
                byMember[key] = [];
            byMember[key].push(task);
        }
        return byMember;
    }
    async detectConflicts(teamId, from, to) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team || team.isArchived)
            throw { status: 404, message: "Team không tồn tại" };
        const tasks = await task_model_1.Task.find({
            "teamAssignment.teamId": new mongoose_1.Types.ObjectId(teamId),
            "scheduledTime.start": { $gte: from, $lte: to },
            isArchived: false,
        }).lean();
        const conflicts = [];
        const byMember = {};
        for (const task of tasks) {
            const key = task.teamAssignment.assigneeId.toString();
            if (!byMember[key])
                byMember[key] = [];
            byMember[key].push(task);
        }
        for (const [memberId, memberTasks] of Object.entries(byMember)) {
            const sorted = memberTasks.sort((a, b) => new Date(a.scheduledTime.start).getTime() -
                new Date(b.scheduledTime.start).getTime());
            for (let i = 0; i < sorted.length - 1; i++) {
                const endA = new Date(sorted[i].scheduledTime.end);
                const startB = new Date(sorted[i + 1].scheduledTime.start);
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
exports.TeamService = TeamService;
exports.teamService = new TeamService();
