import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import {
  getRoutines,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  seedDefaultRoutines,
} from "./routine.controller";

const routineRouter = Router();

routineRouter.use(authMiddleware);

routineRouter.get("/", getRoutines);
routineRouter.post("/", createRoutine);
routineRouter.post("/seed", seedDefaultRoutines);
routineRouter.put("/:id", updateRoutine);
routineRouter.patch("/:id", updateRoutine);
routineRouter.delete("/:id", deleteRoutine);

export default routineRouter;
