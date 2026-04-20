import { Types } from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { Team, TeamRole } from "./team.model";
import { TeamInvite, TeamInviteDoc } from "./team-invite.model";
import { mailService } from "../../services/mail.service";

export class InviteService {
  async inviteMember(
    teamId: string,
    inviterId: string,
    email: string,
    role: TeamRole,
  ): Promise<void> {
    const team = await Team.findById(teamId);
    if (!team) throw { status: 404, message: "Team không tồn tại" };

    const inviter = team.members.find((m) => m.userId.toString() === inviterId);
    if (!inviter || !["owner", "admin"].includes(inviter.role)) {
      throw { status: 403, message: "Không có quyền mời thành viên" };
    }
    if (role === "owner")
      throw { status: 400, message: "Không thể mời với role owner" };

    const alreadyMember = team.members.some(
      (m) => m.email === email.toLowerCase(),
    );
    if (alreadyMember)
      throw { status: 409, message: "Email này đã là thành viên của team" };

    const existingInvite = await TeamInvite.findOne({
      teamId,
      email: email.toLowerCase(),
      status: "pending",
    });
    if (existingInvite)
      throw { status: 409, message: "Đã có lời mời đang chờ cho email này" };

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await TeamInvite.create({
      teamId: new Types.ObjectId(teamId),
      inviterId: new Types.ObjectId(inviterId),
      email: email.toLowerCase(),
      role,
      token,
      expiresAt,
      status: "pending",
    });

    // Send invite email
    const inviteUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/teams/invite?token=${token}`;
    await mailService.sendTeamInvite({
      to: email,
      teamName: team.name,
      inviterName: inviter.name || "Admin",
      role,
      inviteUrl,
      expiresAt,
    });

    console.log(
      `[InviteService] Invite sent to ${email} for team ${team.name}. Token: ${token}`,
    );
  }

  async acceptInvite(
    token: string,
    userId: string,
    userInfo: { email: string; name: string; avatar?: string },
  ) {
    const invite = await TeamInvite.findOne({ token });
    if (!invite) throw { status: 404, message: "Lời mời không tồn tại" };
    if (invite.status !== "pending")
      throw { status: 400, message: "Lời mời đã được xử lý" };
    if (invite.expiresAt < new Date()) {
      invite.status = "expired";
      await invite.save();
      throw { status: 410, message: "Lời mời đã hết hạn" };
    }

    const team = await Team.findById(invite.teamId);
    if (!team) throw { status: 404, message: "Team không tồn tại" };

    const alreadyMember = team.members.some(
      (m) => m.userId.toString() === userId,
    );
    if (alreadyMember)
      throw { status: 409, message: "Bạn đã là thành viên của team này" };

    team.members.push({
      userId: new Types.ObjectId(userId),
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

  async declineInvite(token: string): Promise<void> {
    const invite = await TeamInvite.findOne({ token });
    if (!invite) throw { status: 404, message: "Lời mời không tồn tại" };
    invite.status = "declined";
    await invite.save();
  }

  async revokeInvite(
    teamId: string,
    requesterId: string,
    inviteId: string,
  ): Promise<void> {
    const team = await Team.findById(teamId);
    if (!team) throw { status: 404, message: "Team không tồn tại" };
    const requester = team.members.find(
      (m) => m.userId.toString() === requesterId,
    );
    if (!requester || !["owner", "admin"].includes(requester.role)) {
      throw { status: 403, message: "Không có quyền thu hồi lời mời" };
    }
    await TeamInvite.findByIdAndDelete(inviteId);
  }

  async listPendingInvites(teamId: string, requesterId: string) {
    const team = await Team.findById(teamId);
    if (!team) throw { status: 404, message: "Team không tồn tại" };
    const requester = team.members.find(
      (m) => m.userId.toString() === requesterId,
    );
    if (!requester || !["owner", "admin"].includes(requester.role)) {
      throw { status: 403, message: "Không có quyền xem lời mời" };
    }
    return TeamInvite.find({ teamId, status: "pending" }).lean();
  }

  async getInviteInfo(token: string) {
    const invite = await TeamInvite.findOne({ token });
    if (!invite) throw { status: 404, message: "Lời mời không tồn tại" };
    if (invite.expiresAt < new Date())
      throw { status: 410, message: "Lời mời đã hết hạn" };
    const team = await Team.findById(invite.teamId);
    if (!team) throw { status: 404, message: "Team không tồn tại" };
    const inviter = team.members.find(
      (m) => m.userId.toString() === invite.inviterId.toString(),
    );
    return {
      teamName: team.name,
      teamId: team._id.toString(),
      inviterName: inviter?.name || "Unknown",
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt,
    };
  }
}

export const inviteService = new InviteService();
