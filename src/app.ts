import express, { Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRouter from "./modules/auth/auth.routes";
import userRouter from "./modules/user/user.routes";

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

  app.get("/", (_req, res) => {
    res.send("hello");
  });

  app.use("/auth", authRouter);
  app.use("/users", userRouter);

  return app;
};
