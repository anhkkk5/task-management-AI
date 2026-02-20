import { Request, Response, NextFunction } from "express";

// Middleware kiểm tra user có role admin không
export const adminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const userRole = (req as any).user?.role;

  if (userRole !== "admin") {
    res.status(403).json({
      message: "Forbidden - Admin access required",
    });
    return;
  }

  next();
};
