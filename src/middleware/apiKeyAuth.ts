import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";

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
  const expected = process.env.API_KEY;

  if (!expected) {
    // Fail closed: an unset API_KEY must never mean "open to everyone."
    res.status(500).json({ error: "Server misconfigured: API_KEY is not set" });
    return;
  }

  const provided = req.header("x-api-key");

  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
