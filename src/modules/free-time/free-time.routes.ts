import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import {
  deleteCustomDate,
  getMyAvailability,
  setCustomDate,
  updateWeeklyPattern,
} from "./free-time.controller";

const freeTimeRouter = Router();

freeTimeRouter.get("/me", authMiddleware, getMyAvailability);
freeTimeRouter.put("/weekly", authMiddleware, updateWeeklyPattern);
freeTimeRouter.put("/custom-dates/:date", authMiddleware, setCustomDate);
freeTimeRouter.delete("/custom-dates/:date", authMiddleware, deleteCustomDate);

export default freeTimeRouter;
