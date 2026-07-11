import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { rateLimit } from "express-rate-limit";
import { walletRouter } from "./routes/wallet";
import { accountRouter } from "./routes/account";
import { priceRouter } from "./routes/price";
import { errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.use(helmet());
  // Default-deny: cross-origin requests are rejected unless CORS_ORIGIN is
  // explicitly set. A wildcard default would let any website drive this API
  // (including /wallet/send) from a logged-in user's browser.
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? false }));
  app.use(morgan("combined"));
  app.use(express.json({ limit: "10kb" }));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 min
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  // Health
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Routes
  app.use("/api/v1/wallet", walletRouter);
  app.use("/api/v1/account", accountRouter);
  app.use("/api/v1/price", priceRouter);

  app.use(errorHandler);

  return app;
}
