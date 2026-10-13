import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { aiLimiter } from "../../middleware/rate-limit.middleware";
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
  applyCalendarAction,
} from "./ai.controller";

const aiRouter = Router();

// Toàn bộ các API AI đều yêu cầu xác thực và áp dụng hạn mức gọi LLM (key theo userId)
aiRouter.use(authMiddleware);
aiRouter.use(aiLimiter);

aiRouter.post("/chat", chat);
aiRouter.post("/chat/stream", chatStream);
aiRouter.post("/apply-calendar-action", applyCalendarAction);
aiRouter.get("/conversations", listConversations);
aiRouter.get(
  "/conversations/by-parent/:parentTaskId",
  getOrCreateConversationByParent,
);
aiRouter.get("/conversations/:id", getConversationById);
aiRouter.delete("/conversations/:id", deleteConversation);
aiRouter.patch("/conversations/:id", renameConversation);

aiRouter.post("/task-breakdown", taskBreakdown);
aiRouter.post("/priority-suggest", prioritySuggest);
aiRouter.post("/schedule-plan", schedulePlan);
aiRouter.post("/smart-reschedule", smartReschedule);

export default aiRouter;
