import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal server error";
  const status =
    message.includes("Not Found") || message.includes("does not exist") ? 404 : 500;
  res.status(status).json({ error: message });
}
