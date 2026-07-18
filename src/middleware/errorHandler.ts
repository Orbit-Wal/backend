import { Request, Response, NextFunction } from "express";
import { LockAcquisitionError, SequenceConflictError } from "../services/stellarErrors";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(err);

  // These carry their own accurate status/code/message — a bare Horizon
  // 400 or a generic 500 would hide exactly the information (retryable?
  // what happened? what to do?) the caller needs.
  if (err instanceof SequenceConflictError) {
    res
      .status(409)
      .json({ error: err.message, code: err.code, retryable: err.retryable });
    return;
  }
  if (err instanceof LockAcquisitionError) {
    res
      .status(503)
      .json({ error: err.message, code: err.code, retryable: err.retryable });
    return;
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  const status =
    message.includes("Not Found") || message.includes("does not exist") ? 404 : 500;
  res.status(status).json({ error: message });
}
