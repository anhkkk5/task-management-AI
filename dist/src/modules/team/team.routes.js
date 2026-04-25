"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const team_service_1 = require("./team.service");
const invite_service_1 = require("./invite.service");
const team_task_comment_service_1 = require("./team-task-comment.service");
const router = (0, express_1.Router)();
// ─── Team CRUD ────────────────────────────────────────────────────────────────
router.post("/", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = req.user;
        const nameFromEmail = user.email.split("@")[0];
        const team = await team_service_1.teamService.createTeam(userId, { email: user.email, name: nameFromEmail, avatar: user.avatar }, req.body);
        res.status(201).json(team);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.get("/", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const teams = await team_service_1.teamService.listTeams(userId);
        res.json(teams);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.get("/:id", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const team = await team_service_1.teamService.getTeam(req.params.id, userId);
        res.json(team);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.put("/:id", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const team = await team_service_1.teamService.updateTeam(req.params.id, userId, req.body);
        res.json(team);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.delete("/:id", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        await team_service_1.teamService.deleteTeam(req.params.id, userId);
        res.json({ message: "Team đã được xóa" });
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
// ─── Members ──────────────────────────────────────────────────────────────────
router.delete("/:id/members/:memberId", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const team = await team_service_1.teamService.removeMember(req.params.id, userId, req.params.memberId);
        res.json(team);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.get("/:id/tasks/:taskId/comments", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await team_task_comment_service_1.teamTaskCommentService.listByTask(req.params.id, req.params.taskId, userId);
        res.json(result);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.post("/:id/tasks/:taskId/comments", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await team_task_comment_service_1.teamTaskCommentService.create(req.params.id, req.params.taskId, userId, String(req.body?.content || ""));
        res.status(201).json(result);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.patch("/:id/members/:memberId/role", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const team = await team_service_1.teamService.updateMemberRole(req.params.id, userId, req.params.memberId, req.body.role);
        res.json(team);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.patch("/:id/members/:memberId/profile", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const team = await team_service_1.teamService.updateMemberProfile(req.params.id, userId, req.params.memberId, {
            position: req.body?.position === undefined
                ? undefined
                : req.body.position === null
                    ? null
                    : String(req.body.position),
            level: req.body?.level === undefined
                ? undefined
                : req.body.level === null
                    ? null
                    : String(req.body.level),
        });
        res.json(team);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
// ─── Invites ──────────────────────────────────────────────────────────────────
router.post("/:id/invite", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        await invite_service_1.inviteService.inviteMember(req.params.id, userId, req.body.email, req.body.role || "member");
        res.json({ message: "Lời mời đã được gửi" });
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.get("/:id/invites", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const invites = await invite_service_1.inviteService.listPendingInvites(req.params.id, userId);
        res.json(invites);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.delete("/:id/invites/:inviteId", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        await invite_service_1.inviteService.revokeInvite(req.params.id, userId, req.params.inviteId);
        res.json({ message: "Lời mời đã được thu hồi" });
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
// Accept/Decline invite (public - no auth required for token-based)
router.get("/invite/info", async (req, res) => {
    try {
        const { token } = req.query;
        const info = await invite_service_1.inviteService.getInviteInfo(token);
        res.json(info);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.post("/invite/accept", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = req.user;
        const nameFromEmail = user.email.split("@")[0];
        const team = await invite_service_1.inviteService.acceptInvite(req.body.token, userId, {
            email: user.email,
            name: nameFromEmail,
            avatar: user.avatar,
        });
        res.json({ message: "Đã tham gia team", teamId: team._id.toString() });
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.post("/invite/decline", async (req, res) => {
    try {
        await invite_service_1.inviteService.declineInvite(req.body.token);
        res.json({ message: "Đã từ chối lời mời" });
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
// ─── Tasks ────────────────────────────────────────────────────────────────────
router.get("/:id/tasks", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const tasks = await team_service_1.teamService.getTeamTasks(req.params.id, userId, req.query);
        res.json(tasks);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.get("/:id/board", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        await team_service_1.teamService.getTeam(req.params.id, userId);
        const board = await team_service_1.teamService.getTeamBoard(req.params.id);
        res.json(board);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.post("/:id/tasks", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const startAtRaw = req.body?.startAt;
        const deadlineRaw = req.body?.deadline;
        const startAt = startAtRaw ? new Date(String(startAtRaw)) : undefined;
        const deadline = deadlineRaw ? new Date(String(deadlineRaw)) : undefined;
        if (startAtRaw && Number.isNaN(startAt?.getTime())) {
            res.status(400).json({ message: "Thời gian bắt đầu không hợp lệ" });
            return;
        }
        if (deadlineRaw && Number.isNaN(deadline?.getTime())) {
            res.status(400).json({ message: "Deadline không hợp lệ" });
            return;
        }
        const task = await team_service_1.teamService.createTeamTask(req.params.id, userId, {
            title: String(req.body?.title ?? ""),
            description: req.body?.description === undefined
                ? undefined
                : String(req.body.description),
            status: req.body?.status,
            priority: req.body?.priority,
            assigneeId: String(req.body?.assigneeId ?? ""),
            startAt,
            deadline,
        });
        res.status(201).json(task);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.patch("/:id/tasks/:taskId", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const startAtRaw = req.body?.startAt;
        const deadlineRaw = req.body?.deadline;
        const startAt = startAtRaw ? new Date(String(startAtRaw)) : undefined;
        const deadline = deadlineRaw ? new Date(String(deadlineRaw)) : undefined;
        if (startAtRaw && Number.isNaN(startAt?.getTime())) {
            res.status(400).json({ message: "Thời gian bắt đầu không hợp lệ" });
            return;
        }
        if (deadlineRaw && Number.isNaN(deadline?.getTime())) {
            res.status(400).json({ message: "Deadline không hợp lệ" });
            return;
        }
        const task = await team_service_1.teamService.updateTeamTask(req.params.id, req.params.taskId, userId, {
            title: req.body?.title === undefined ? undefined : String(req.body.title),
            description: req.body?.description === undefined
                ? undefined
                : String(req.body.description),
            status: req.body?.status,
            priority: req.body?.priority,
            assigneeId: req.body?.assigneeId === undefined
                ? undefined
                : String(req.body.assigneeId),
            startAt,
            deadline,
        });
        res.json(task);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.patch("/:id/tasks/:taskId/status", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const status = String(req.body?.status || "").trim();
        if (![
            "todo",
            "scheduled",
            "in_progress",
            "completed",
            "cancelled",
        ].includes(status)) {
            res.status(400).json({ message: "Status không hợp lệ" });
            return;
        }
        const task = await team_service_1.teamService.updateTeamTaskStatus(req.params.id, req.params.taskId, userId, status);
        res.json(task);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.delete("/:id/tasks/:taskId", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await team_service_1.teamService.deleteTeamTask(req.params.id, req.params.taskId, userId);
        res.json(result);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.post("/:id/tasks/:taskId/assign", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const task = await team_service_1.teamService.assignTask(req.params.id, req.params.taskId, req.body.assigneeId, userId);
        res.json(task);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.delete("/:id/tasks/:taskId/assign", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const userId = req.user.userId;
        const task = await team_service_1.teamService.unassignTask(req.params.id, req.params.taskId, userId);
        res.json(task);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.get("/:id/members/:memberId/workload", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const workload = await team_service_1.teamService.getMemberWorkload(req.params.id, req.params.memberId);
        res.json(workload);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
// ─── Calendar & Conflicts ─────────────────────────────────────────────────────
router.get("/:id/calendar", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const { from, to } = req.query;
        const calendar = await team_service_1.teamService.getTeamCalendar(req.params.id, new Date(from), new Date(to));
        res.json(calendar);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
router.get("/:id/conflicts", auth_middleware_1.authMiddleware, async (req, res) => {
    try {
        const { from, to } = req.query;
        const conflicts = await team_service_1.teamService.detectConflicts(req.params.id, new Date(from), new Date(to));
        res.json(conflicts);
    }
    catch (err) {
        res.status(err.status || 500).json({ message: err.message });
    }
});
exports.default = router;
