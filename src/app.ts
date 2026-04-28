import express, { Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";
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
import freeTimeRouter from "./modules/free-time/free-time.routes";
import guestRouter from "./modules/guest/routes/guest.routes";
import colorsRouter from "./modules/colors/colors.routes";
import teamRouter from "./modules/team/team.routes";
import catalogRouter from "./modules/catalog/catalog.routes";
import { setupPassport } from "./config/passport";

const getAllowedCorsOrigins = (): string[] => {
  const envOrigins = [process.env.CLIENT_URL, process.env.FRONTEND_URL]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(
    new Set([...envOrigins, "http://localhost:5173", "http://127.0.0.1:5173"]),
  );
};

export const createApp = (): Express => {
  const app: Express = express();

  app.use(
    cors({
      origin: getAllowedCorsOrigins(),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.use(
    compression({
      threshold: 1024, // do not bother compressing tiny payloads
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        return compression.filter(req, res);
      },
    }),
  );

  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

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

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
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
  app.use("/free-time", freeTimeRouter);
  app.use("/guests", guestRouter);
  app.use("/colors", colorsRouter);
  app.use("/teams", teamRouter);
  app.use("/catalog", catalogRouter);

  return app;
};
