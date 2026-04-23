import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import {
  chat,
  chatStream,
  getConversationById,
  getOrCreateConversationByParent,
  listConversations,
  prioritySuggest,
  schedulePlan,
  smartReschedule,
  taskBreakdown,
  deleteConversation,
  renameConversation,
} from "./ai.controller";

const aiRouter = Router();

aiRouter.post("/chat", authMiddleware, chat);
aiRouter.post("/chat/stream", authMiddleware, chatStream);
aiRouter.get("/conversations", authMiddleware, listConversations);
aiRouter.get(
  "/conversations/by-parent/:parentTaskId",
  authMiddleware,
  getOrCreateConversationByParent,
);
aiRouter.get("/conversations/:id", authMiddleware, getConversationById);
aiRouter.delete("/conversations/:id", authMiddleware, deleteConversation);
aiRouter.patch("/conversations/:id", authMiddleware, renameConversation);

aiRouter.post("/task-breakdown", authMiddleware, taskBreakdown);

aiRouter.post("/priority-suggest", authMiddleware, prioritySuggest);

aiRouter.post("/schedule-plan", authMiddleware, schedulePlan);

aiRouter.post("/smart-reschedule", authMiddleware, smartReschedule);

export default aiRouter;
