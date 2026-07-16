import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { config } from "../config";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Gates sensitive routes (key generation, fund movement) behind a shared
// secret. This is an interim measure — see issue tracker for the JWT-based
// per-user auth that should replace it.
export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const expected = config.API_KEY;

  const provided = req.header("x-api-key");

  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
