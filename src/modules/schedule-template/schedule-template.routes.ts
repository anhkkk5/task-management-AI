import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import {
  createFromSchedule,
  createTemplate,
  getTemplate,
  listTemplates,
  getDefaultTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
  setDefaultTemplate,
} from "./schedule-template.controller";

const scheduleTemplateRouter = Router();

// List and create
scheduleTemplateRouter.get("/", authMiddleware, listTemplates);
scheduleTemplateRouter.post("/", authMiddleware, createTemplate);

// Get default template
scheduleTemplateRouter.get("/default", authMiddleware, getDefaultTemplate);

// Create from AI schedule
scheduleTemplateRouter.post("/from-schedule", authMiddleware, createFromSchedule);

// Individual template operations
scheduleTemplateRouter.get("/:id", authMiddleware, getTemplate);
scheduleTemplateRouter.patch("/:id", authMiddleware, updateTemplate);
scheduleTemplateRouter.delete("/:id", authMiddleware, deleteTemplate);

// Apply and set default
scheduleTemplateRouter.post("/:id/apply", authMiddleware, applyTemplate);
scheduleTemplateRouter.post("/:id/set-default", authMiddleware, setDefaultTemplate);

export default scheduleTemplateRouter;
