"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inviteService = exports.InviteService = void 0;
const mongoose_1 = require("mongoose");
const uuid_1 = require("uuid");
const team_model_1 = require("./team.model");
const team_invite_model_1 = require("./team-invite.model");
const mail_service_1 = require("../../services/mail.service");
const STUDENT_MANAGER_ROLES = [
    "owner",
    "admin",
    "student_leader",
    "lecturer_leader",
];
const COMPANY_MANAGER_ROLES = ["owner", "admin"];
function canManageInvites(teamType, role) {
    const roles = teamType === "student" ? STUDENT_MANAGER_ROLES : COMPANY_MANAGER_ROLES;
    return roles.includes(role);
}
function isRoleAllowedForTeamType(teamType, role) {
    if (role === "owner")
        return false;
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
class InviteService {
    async inviteMember(teamId, inviterId, email, role) {
        const normalizedEmail = email.trim().toLowerCase();
        const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
        if (!isValidEmail) {
            throw { status: 400, message: "Email không hợp lệ" };
        }
        const team = await team_model_1.Team.findById(teamId);
        if (!team)
            throw { status: 404, message: "Team không tồn tại" };
        const inviter = team.members.find((m) => m.userId.toString() === inviterId);
        if (!inviter || !canManageInvites(team.teamType, inviter.role)) {
            throw { status: 403, message: "Không có quyền mời thành viên" };
        }
        if (!isRoleAllowedForTeamType(team.teamType, role)) {
            throw {
                status: 400,
                message: team.teamType === "student"
                    ? "Role không hợp lệ cho nhóm sinh viên"
                    : "Role không hợp lệ cho nhóm công ty",
            };
        }
        const alreadyMember = team.members.some((m) => m.email.toLowerCase() === normalizedEmail);
        if (alreadyMember)
            throw { status: 409, message: "Email này đã là thành viên của team" };
        const existingInvite = await team_invite_model_1.TeamInvite.findOne({
            teamId,
            email: normalizedEmail,
            status: "pending",
        });
        if (existingInvite)
            throw { status: 409, message: "Đã có lời mời đang chờ cho email này" };
        const token = (0, uuid_1.v4)();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const invite = await team_invite_model_1.TeamInvite.create({
            teamId: new mongoose_1.Types.ObjectId(teamId),
            inviterId: new mongoose_1.Types.ObjectId(inviterId),
            email: normalizedEmail,
            role,
            token,
            expiresAt,
            status: "pending",
        });
        try {
            // Send invite email
            const inviteUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/teams/invite/accept?token=${token}`;
            await mail_service_1.mailService.sendTeamInvite({
                to: normalizedEmail,
                teamName: team.name,
                inviterName: inviter.name || "Admin",
                role,
                inviteUrl,
                expiresAt,
            });
        }
        catch (error) {
            await team_invite_model_1.TeamInvite.findByIdAndDelete(invite._id);
            console.error("[InviteService] Send invite mail failed:", error);
            throw {
                status: 500,
                message: "Không thể gửi email mời. Vui lòng kiểm tra cấu hình SMTP (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS).",
            };
        }
        console.log(`[InviteService] Invite sent to ${normalizedEmail} for team ${team.name}. Token: ${token}`);
    }
    async acceptInvite(token, userId, userInfo) {
        const invite = await team_invite_model_1.TeamInvite.findOne({ token });
        if (!invite)
            throw { status: 404, message: "Lời mời không tồn tại" };
        if (invite.status !== "pending")
            throw { status: 400, message: "Lời mời đã được xử lý" };
        if (invite.expiresAt < new Date()) {
            invite.status = "expired";
            await invite.save();
            throw { status: 410, message: "Lời mời đã hết hạn" };
        }
        const team = await team_model_1.Team.findById(invite.teamId);
        if (!team)
            throw { status: 404, message: "Team không tồn tại" };
        if (invite.email.toLowerCase() !== userInfo.email.toLowerCase()) {
            throw {
                status: 403,
                message: "Email đăng nhập không khớp với email được mời",
            };
        }
        const alreadyMember = team.members.some((m) => m.userId.toString() === userId);
        if (alreadyMember)
            throw { status: 409, message: "Bạn đã là thành viên của team này" };
        team.members.push({
            userId: new mongoose_1.Types.ObjectId(userId),
            email: userInfo.email,
            name: userInfo.name,
            avatar: userInfo.avatar,
            role: invite.role,
            joinedAt: new Date(),
        });
        await team.save();
        invite.status = "accepted";
        await invite.save();
        return team;
    }
    async declineInvite(token) {
        const invite = await team_invite_model_1.TeamInvite.findOne({ token });
        if (!invite)
            throw { status: 404, message: "Lời mời không tồn tại" };
        invite.status = "declined";
        await invite.save();
    }
    async revokeInvite(teamId, requesterId, inviteId) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team)
            throw { status: 404, message: "Team không tồn tại" };
        const requester = team.members.find((m) => m.userId.toString() === requesterId);
        if (!requester || !canManageInvites(team.teamType, requester.role)) {
            throw { status: 403, message: "Không có quyền thu hồi lời mời" };
        }
        await team_invite_model_1.TeamInvite.findByIdAndDelete(inviteId);
    }
    async listPendingInvites(teamId, requesterId) {
        const team = await team_model_1.Team.findById(teamId);
        if (!team)
            throw { status: 404, message: "Team không tồn tại" };
        const requester = team.members.find((m) => m.userId.toString() === requesterId);
        if (!requester || !canManageInvites(team.teamType, requester.role)) {
            throw { status: 403, message: "Không có quyền xem lời mời" };
        }
        return team_invite_model_1.TeamInvite.find({ teamId, status: "pending" }).lean();
    }
    async getInviteInfo(token) {
        const invite = await team_invite_model_1.TeamInvite.findOne({ token });
        if (!invite)
            throw { status: 404, message: "Lời mời không tồn tại" };
        const team = await team_model_1.Team.findById(invite.teamId);
        if (!team)
            throw { status: 404, message: "Team không tồn tại" };
        if (invite.status === "accepted") {
            return {
                status: "accepted",
                teamId: team._id.toString(),
                teamName: team.name,
            };
        }
        if (invite.status === "declined") {
            return {
                status: "declined",
                teamId: team._id.toString(),
                teamName: team.name,
            };
        }
        if (invite.expiresAt < new Date()) {
            if (invite.status === "pending") {
                invite.status = "expired";
                await invite.save();
            }
            return {
                status: "expired",
                teamId: team._id.toString(),
                teamName: team.name,
                expiresAt: invite.expiresAt,
            };
        }
        const inviter = team.members.find((m) => m.userId.toString() === invite.inviterId.toString());
        return {
            status: "pending",
            teamName: team.name,
            teamId: team._id.toString(),
            inviterName: inviter?.name || "Unknown",
            role: invite.role,
            email: invite.email,
            expiresAt: invite.expiresAt,
        };
    }
}
exports.InviteService = InviteService;
exports.inviteService = new InviteService();
