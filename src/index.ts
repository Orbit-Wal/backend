import "dotenv/config";
import { config } from "./config";
import { createApp } from "./app";

const app = createApp();

app.listen(config.PORT, () => {
  console.log(`GlobeWallet API running on port ${config.PORT}`);
});
