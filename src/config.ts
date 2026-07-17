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
});

export const config = envSchema.parse(process.env);
