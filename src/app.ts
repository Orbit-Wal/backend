import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { rateLimit } from "express-rate-limit";
import { createWalletRouter } from "./routes/wallet";
import { createAccountRouter } from "./routes/account";
import { priceRouter } from "./routes/price";
import { errorHandler } from "./middleware/errorHandler";
import { config } from "./config";
import { StellarService } from "./services/stellar";

export function createApp(stellar: StellarService = new StellarService()) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN.split(",") }));
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
  app.use("/api/v1/wallet", createWalletRouter(stellar));
  app.use("/api/v1/account", createAccountRouter(stellar));
  app.use("/api/v1/price", priceRouter);

  app.use(errorHandler);

  return app;
}
