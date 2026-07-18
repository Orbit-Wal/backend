import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";

export function jwtAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    if (payload.type !== "access") {
      res.status(401).json({ error: "Invalid token type" });
      return;
    }
    req.user = { sub: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
