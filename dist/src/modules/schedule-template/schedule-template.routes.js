"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const schedule_template_controller_1 = require("./schedule-template.controller");
const scheduleTemplateRouter = (0, express_1.Router)();
// List and create
scheduleTemplateRouter.get("/", auth_middleware_1.authMiddleware, schedule_template_controller_1.listTemplates);
scheduleTemplateRouter.post("/", auth_middleware_1.authMiddleware, schedule_template_controller_1.createTemplate);
// Get default template
scheduleTemplateRouter.get("/default", auth_middleware_1.authMiddleware, schedule_template_controller_1.getDefaultTemplate);
// Create from AI schedule
scheduleTemplateRouter.post("/from-schedule", auth_middleware_1.authMiddleware, schedule_template_controller_1.createFromSchedule);
// Individual template operations
scheduleTemplateRouter.get("/:id", auth_middleware_1.authMiddleware, schedule_template_controller_1.getTemplate);
scheduleTemplateRouter.patch("/:id", auth_middleware_1.authMiddleware, schedule_template_controller_1.updateTemplate);
scheduleTemplateRouter.delete("/:id", auth_middleware_1.authMiddleware, schedule_template_controller_1.deleteTemplate);
// Apply and set default
scheduleTemplateRouter.post("/:id/apply", auth_middleware_1.authMiddleware, schedule_template_controller_1.applyTemplate);
scheduleTemplateRouter.post("/:id/set-default", auth_middleware_1.authMiddleware, schedule_template_controller_1.setDefaultTemplate);
exports.default = scheduleTemplateRouter;
