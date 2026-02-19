import express, { Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./modules/auth/auth.routes";
import userRouter from "./modules/user/user.routes";
import taskRouter from "./modules/task/task.routes";
import aiRouter from "./modules/ai/ai.routes";
import chatRouter from "./modules/chat/chat.routes";
import notificationRouter from "./modules/notification/notification.routes";

export const createApp = (): Express => {
  const app: Express = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

  return app;
};
