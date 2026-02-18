import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import {
  chat,
  chatStream,
  getConversationById,
  listConversations,
  prioritySuggest,
  schedulePlan,
  taskBreakdown,
} from "./ai.controller";

const aiRouter = Router();

aiRouter.post("/chat", authMiddleware, chat);

aiRouter.post("/chat/stream", authMiddleware, chatStream);

aiRouter.get("/conversations", authMiddleware, listConversations);

aiRouter.get("/conversations/:id", authMiddleware, getConversationById);

aiRouter.post("/task-breakdown", authMiddleware, taskBreakdown);

aiRouter.post("/priority-suggest", authMiddleware, prioritySuggest);

aiRouter.post("/schedule-plan", authMiddleware, schedulePlan);

export default aiRouter;
