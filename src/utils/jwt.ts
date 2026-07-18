import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { config } from "../config";

interface TokenPayload {
  sub: string;
  type: "access" | "refresh";
}

interface RefreshRecord {
  sub: string;
  expiresAt: Date;
  revoked: boolean;
}

const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const refreshStore = new Map<string, RefreshRecord>();

export function generateAccessToken(sub: string): string {
  return jwt.sign({ sub, type: "access" } satisfies TokenPayload, config.JWT_SECRET, {
    expiresIn: ACCESS_EXPIRY,
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.JWT_SECRET) as TokenPayload;
}

export function generateRefreshToken(sub: string): string {
  const token = randomUUID();
  refreshStore.set(token, {
    sub,
    expiresAt: new Date(Date.now() + REFRESH_EXPIRY_MS),
    revoked: false,
  });
  return token;
}

export function rotateRefreshToken(oldToken: string): { accessToken: string; refreshToken: string } | null {
  const record = refreshStore.get(oldToken);
  if (!record || record.revoked || record.expiresAt < new Date()) {
    refreshStore.delete(oldToken);
    return null;
  }
  refreshStore.delete(oldToken);
  const accessToken = generateAccessToken(record.sub);
  const refreshToken = generateRefreshToken(record.sub);
  return { accessToken, refreshToken };
}

export function revokeRefreshToken(token: string): void {
  const record = refreshStore.get(token);
  if (record) {
    record.revoked = true;
  }
}

export function getRefreshTokenSub(token: string): string | null {
  const record = refreshStore.get(token);
  if (!record || record.revoked || record.expiresAt < new Date()) {
    return null;
  }
  return record.sub;
}
