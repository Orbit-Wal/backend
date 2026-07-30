import { Router } from "express";
import { body } from "express-validator";
import { UnauthorizedError } from "../errors/appError";
import { apiKeyAuth } from "../middleware/apiKeyAuth";
import { assertValidRequest } from "../middleware/requestValidation";
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
  (req, res, next) => {
    try {
      assertValidRequest(req);
      const result = rotateRefreshToken(req.body.refreshToken);
      if (!result) {
        throw new UnauthorizedError(
          "Invalid, expired, or revoked refresh token",
          "REFRESH_TOKEN_INVALID"
        );
      }
      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tokenType: "Bearer",
      });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post(
  "/logout",
  body("refreshToken").isString().notEmpty(),
  (req, res, next) => {
    try {
      assertValidRequest(req);
      revokeRefreshToken(req.body.refreshToken);
      res.json({ message: "Logged out" });
    } catch (err) {
      next(err);
    }
  }
);
