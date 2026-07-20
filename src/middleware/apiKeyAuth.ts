import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { config } from "../config";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// DEPRECATED: Gates sensitive routes behind a shared API key.
// Replaced by JWT-based per-user auth. Migrate by calling POST /api/v1/auth/login
// with x-api-key to receive access/refresh tokens, then use Bearer auth.
// Scheduled for removal in a future release.
export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  console.warn("[DEPRECATED] apiKeyAuth - use POST /api/v1/auth/login and Bearer tokens instead");
  res.setHeader("X-Deprecated", "apiKeyAuth - use JWT auth via /api/v1/auth/login");
  const expected = config.API_KEY;

  const provided = req.header("x-api-key");

  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
