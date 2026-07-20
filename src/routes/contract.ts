import { Router } from "express";
import { param, body, validationResult } from "express-validator";
import { GlobeWalletContract } from "../services/contracts/globeWallet";
import { jwtAuth } from "../middleware/jwtAuth";

export function createContractRouter(globeWallet: GlobeWalletContract): Router {
  const contractRouter = Router();

  // Read-only, public on-chain data — same trust level as GET /account/*.
  contractRouter.get(
    "/wallet/:publicKey/assets",
    param("publicKey").isLength({ min: 56, max: 56 }),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const assets = await globeWallet.getAssets(req.params.publicKey);
        res.json({ assets });
      } catch (err) {
        next(err);
      }
    }
  );

  // State-changing and fee-paying, and takes a secret key in the body —
  // same trust boundary as POST /wallet/send, so gate it the same way.
  contractRouter.use(jwtAuth);

  contractRouter.post(
    "/wallet/spend",
    body("userSecretKey").isLength({ min: 56 }),
    body("assetCode").isString().isLength({ min: 1, max: 12 }),
    body("amount").isNumeric(),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const { userSecretKey, assetCode, amount } = req.body;
        const result = await globeWallet.recordSpend({ userSecretKey, assetCode, amount });
        res.json({ hash: result.hash, ledger: result.ledger, successful: true });
      } catch (err) {
        next(err);
      }
    }
  );

  return contractRouter;
}
