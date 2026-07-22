import { Request, Response, NextFunction } from "express";
import {
  LockAcquisitionError,
  MemoRequiredError,
  SequenceConflictError,
} from "../services/stellarErrors";
import {
  SorobanNotConfiguredError,
  SorobanSimulationError,
  SorobanTransactionError,
} from "../services/sorobanErrors";

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
  if (err instanceof MemoRequiredError) {
    res
      .status(400)
      .json({ error: err.message, code: err.code, retryable: err.retryable });
    return;
  }
  if (err instanceof SorobanNotConfiguredError) {
    res
      .status(503)
      .json({ error: err.message, code: err.code, retryable: err.retryable });
    return;
  }
  if (err instanceof SorobanSimulationError) {
    // Simulation caught this before anything was submitted or paid for —
    // it's a rejected request, not a server fault.
    res
      .status(422)
      .json({ error: err.message, code: err.code, retryable: err.retryable });
    return;
  }
  if (err instanceof SorobanTransactionError) {
    res
      .status(502)
      .json({ error: err.message, code: err.code, retryable: err.retryable, hash: err.hash });
    return;
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  const status =
    message.includes("Not Found") || message.includes("does not exist") ? 404 : 500;
  res.status(status).json({ error: message });
}
