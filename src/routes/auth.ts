import { Router } from "express";
import { body, validationResult } from "express-validator";
import { apiKeyAuth } from "../middleware/apiKeyAuth";
import {
  generateAccessToken,
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from "../utils/jwt";

export const authRouter = Router();

authRouter.post(
  "/login",
  apiKeyAuth,
  (_req, res) => {
    const sub = "api-key-user";
    const accessToken = generateAccessToken(sub);
    const refreshToken = generateRefreshToken(sub);
    res.json({ accessToken, refreshToken, tokenType: "Bearer" });
  }
);

authRouter.post(
  "/refresh",
  body("refreshToken").isString().notEmpty(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    const result = rotateRefreshToken(req.body.refreshToken);
    if (!result) {
      res.status(401).json({ error: "Invalid, expired, or revoked refresh token" });
      return;
    }
    res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      tokenType: "Bearer",
    });
  }
);

authRouter.post(
  "/logout",
  body("refreshToken").isString().notEmpty(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ errors: errors.array() });
      return;
    }
    revokeRefreshToken(req.body.refreshToken);
    res.json({ message: "Logged out" });
  }
);
