import "dotenv/config";
import { config } from "./config";
import { createApp } from "./app";
import { ensureAuditTable } from "./db";

const app = createApp();

ensureAuditTable().then(() => {
  app.listen(config.PORT, () => {
    console.log(`GlobeWallet API running on port ${config.PORT}`);
  });
});
