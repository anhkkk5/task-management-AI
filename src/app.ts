import express, { Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import authRouter from "./modules/auth/auth.routes";
import userRouter from "./modules/user/user.routes";
import taskRouter from "./modules/task/task.routes";
import aiRouter from "./modules/ai/ai.routes";
import chatRouter from "./modules/chat/chat.routes";
import notificationRouter from "./modules/notification/notification.routes";
import adminRouter from "./modules/admin/admin.routes";
import scheduleTemplateRouter from "./modules/schedule-template/schedule-template.routes";
import aiScheduleRouter from "./modules/ai-schedule/ai-schedule.routes";
import schedulerRouter from "./modules/scheduler/scheduler.routes";
import guestRouter from "./modules/guest/routes/guest.routes";
import colorsRouter from "./modules/colors/colors.routes";
import teamRouter from "./modules/team/team.routes";
import { setupPassport } from "./config/passport";

export const createApp = (): Express => {
  const app: Express = express();

  app.use(
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Initialize Passport
  setupPassport();
  app.use(passport.initialize());

  app.use(((err: any, _req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ message: "JSON không hợp lệ" });
      return;
    }
    next(err);
  }) as any);

  app.get("/", (_req, res) => {
    res.send("hello");
  });

  app.use("/auth", authRouter);
  app.use("/users", userRouter);
  app.use("/tasks", taskRouter);
  app.use("/ai", aiRouter);
  app.use("/chat", chatRouter);
  app.use("/notifications", notificationRouter);
  app.use("/admin", adminRouter);
  app.use("/schedule-templates", scheduleTemplateRouter);
  app.use("/ai-schedules", aiScheduleRouter);
  app.use("/scheduler", schedulerRouter);
  app.use("/guests", guestRouter);
  app.use("/colors", colorsRouter);
  app.use("/teams", teamRouter);

  return app;
};
