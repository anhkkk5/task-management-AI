import { Request, Response } from "express";

export const register = async (_req: Request, res: Response): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};

export const login = async (_req: Request, res: Response): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};

export const me = async (_req: Request, res: Response): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};

export const updateProfile = async (
  _req: Request,
  res: Response
): Promise<void> => {
  res.status(501).json({ message: "Not implemented" });
};
