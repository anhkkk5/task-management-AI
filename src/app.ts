import express, { Express } from "express";
import cors from "cors";
import authRouter from "./modules/auth/auth.routes";

export const createApp = (): Express => {
  const app: Express = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (_req, res) => {
    res.send("hello");
  });

  app.use("/auth", authRouter);

  return app;
};
