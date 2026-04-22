import { Router, Request, Response } from "express";
import { INDUSTRIES, LEVELS } from "./catalog.data";

const router = Router();

// Public endpoint: catalog không chứa dữ liệu nhạy cảm
router.get("/industries", (_req: Request, res: Response) => {
  res.json({
    industries: INDUSTRIES,
    levels: Object.values(LEVELS),
  });
});

export default router;
