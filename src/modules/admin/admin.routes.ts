import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { adminMiddleware } from "../../middleware/admin.middleware";
import { adminController } from "./admin.controller";

const adminRouter = Router();

// All admin routes require authentication + admin role
adminRouter.use(authMiddleware, adminMiddleware);

// Dashboard
adminRouter.get("/dashboard", adminController.getDashboardStats);

// User management
adminRouter.get("/users", adminController.listUsers);
adminRouter.get("/users/:id", adminController.getUserDetails);
adminRouter.patch("/users/:id/role", adminController.updateUserRole);
adminRouter.patch("/users/:id/ban", adminController.toggleUserBan);

// Task management
adminRouter.get("/tasks", adminController.listAllTasks);
adminRouter.delete("/tasks/:id", adminController.deleteAnyTask);
adminRouter.get("/tasks/stats", adminController.getTaskStats);

// Notification management
adminRouter.post("/notifications/broadcast", adminController.broadcastNotification);

// Queue management
adminRouter.get("/queue-status", adminController.getQueueStatus);
adminRouter.post("/queue/retry", adminController.retryFailedJobs);

export default adminRouter;
