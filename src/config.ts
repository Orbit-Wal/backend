import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HORIZON_URL: z.string().url().default("https://horizon-testnet.stellar.org"),
  NETWORK_PASSPHRASE: z.string().min(1),
  CORS_ORIGIN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  API_KEY: z.string().min(1),
  // "in-process" serializes concurrent submissions for the same source
  // account within a single Node process only. Running more than one
  // instance of this API requires "redis" (using REDIS_URL below) to get
  // the same guarantee across instances — see docs/concurrency.md.
  LOCK_BACKEND: z.enum(["in-process", "redis"]).default("in-process"),
});

export const config = envSchema.parse(process.env);
