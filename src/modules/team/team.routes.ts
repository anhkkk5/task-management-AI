import { Router, Request, Response } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { teamService } from "./team.service";
import { inviteService } from "./invite.service";

const router = Router();

// ─── Team CRUD ────────────────────────────────────────────────────────────────

router.post("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const user = (req as any).user;
    const nameFromEmail = user.email.split("@")[0];
    const team = await teamService.createTeam(
      userId,
      { email: user.email, name: nameFromEmail, avatar: user.avatar },
      req.body,
    );
    res.status(201).json(team);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.get("/", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const teams = await teamService.listTeams(userId);
    res.json(teams);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const team = await teamService.getTeam(req.params.id as string, userId);
    res.json(team);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.put("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const team = await teamService.updateTeam(
      req.params.id as string,
      userId,
      req.body,
    );
    res.json(team);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    await teamService.deleteTeam(req.params.id as string, userId);
    res.json({ message: "Team đã được xóa" });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ─── Members ──────────────────────────────────────────────────────────────────

router.delete(
  "/:id/members/:memberId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const team = await teamService.removeMember(
        req.params.id as string,
        userId,
        req.params.memberId as string,
      );
      res.json(team);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

router.post(
  "/:id/tasks",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
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

      const task = await teamService.createTeamTask(
        req.params.id as string,
        userId,
        {
          title: String(req.body?.title ?? ""),
          status: req.body?.status,
          assigneeId: String(req.body?.assigneeId ?? ""),
          startAt,
          deadline,
        },
      );

      res.status(201).json(task);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

router.patch(
  "/:id/members/:memberId/role",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const team = await teamService.updateMemberRole(
        req.params.id as string,
        userId,
        req.params.memberId as string,
        req.body.role,
      );
      res.json(team);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

// ─── Invites ──────────────────────────────────────────────────────────────────

router.post(
  "/:id/invite",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      await inviteService.inviteMember(
        req.params.id as string,
        userId,
        req.body.email,
        req.body.role || "member",
      );
      res.json({ message: "Lời mời đã được gửi" });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

router.get(
  "/:id/invites",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const invites = await inviteService.listPendingInvites(
        req.params.id as string,
        userId,
      );
      res.json(invites);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

router.delete(
  "/:id/invites/:inviteId",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      await inviteService.revokeInvite(
        req.params.id as string,
        userId,
        req.params.inviteId as string,
      );
      res.json({ message: "Lời mời đã được thu hồi" });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

// Accept/Decline invite (public - no auth required for token-based)
router.get("/invite/info", async (req: Request, res: Response) => {
  try {
    const { token } = req.query as { token: string };
    const info = await inviteService.getInviteInfo(token);
    res.json(info);
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

router.post(
  "/invite/accept",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const user = (req as any).user;
      const nameFromEmail = user.email.split("@")[0];
      const team = await inviteService.acceptInvite(req.body.token, userId, {
        email: user.email,
        name: nameFromEmail,
        avatar: user.avatar,
      });
      res.json({ message: "Đã tham gia team", teamId: team._id.toString() });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

router.post("/invite/decline", async (req: Request, res: Response) => {
  try {
    await inviteService.declineInvite(req.body.token);
    res.json({ message: "Đã từ chối lời mời" });
  } catch (err: any) {
    res.status(err.status || 500).json({ message: err.message });
  }
});

// ─── Tasks ────────────────────────────────────────────────────────────────────

router.get(
  "/:id/tasks",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const tasks = await teamService.getTeamTasks(
        req.params.id as string,
        req.query as any,
      );
      res.json(tasks);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

router.get(
  "/:id/board",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const board = await teamService.getTeamBoard(req.params.id as string);
      res.json(board);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

router.post(
  "/:id/tasks/:taskId/assign",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.userId;
      const task = await teamService.assignTask(
        req.params.id as string,
        req.params.taskId as string,
        req.body.assigneeId,
        userId,
      );
      res.json(task);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

router.delete(
  "/:id/tasks/:taskId/assign",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const task = await teamService.unassignTask(req.params.taskId as string);
      res.json(task);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

router.get(
  "/:id/members/:memberId/workload",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const workload = await teamService.getMemberWorkload(
        req.params.id as string,
        req.params.memberId as string,
      );
      res.json(workload);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

// ─── Calendar & Conflicts ─────────────────────────────────────────────────────

router.get(
  "/:id/calendar",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { from, to } = req.query as { from: string; to: string };
      const calendar = await teamService.getTeamCalendar(
        req.params.id as string,
        new Date(from),
        new Date(to),
      );
      res.json(calendar);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

router.get(
  "/:id/conflicts",
  authMiddleware,
  async (req: Request, res: Response) => {
    try {
      const { from, to } = req.query as { from: string; to: string };
      const conflicts = await teamService.detectConflicts(
        req.params.id as string,
        new Date(from),
        new Date(to),
      );
      res.json(conflicts);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

export default router;
