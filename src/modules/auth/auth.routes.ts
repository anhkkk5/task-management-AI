import { Router } from "express";
import { login, me, register, updateProfile } from "./auth.controller";

const authRouter = Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.get("/me", me);
authRouter.patch("/update-profile", updateProfile);

export default authRouter;
