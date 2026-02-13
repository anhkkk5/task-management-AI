import { Router } from "express";
import { login, me, register, updateProfile } from "./auth.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/me", authMiddleware, me);
authRouter.patch("/update-profile", authMiddleware, updateProfile);

export default authRouter;
