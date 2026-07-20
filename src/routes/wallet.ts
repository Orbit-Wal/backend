import { Router } from "express";
import { body, validationResult } from "express-validator";
import { StellarService } from "../services/stellar";
import { logKeypairIssuance } from "../services/auditLog";
import { jwtAuth } from "../middleware/jwtAuth";

export function createWalletRouter(stellar: StellarService): Router {
  const walletRouter = Router();

  // Fund-movement and key-generation endpoints must never be reachable by an
  // unauthenticated caller — gate the whole router.
  walletRouter.use(jwtAuth);

  walletRouter.post(
    "/send",
    body("sourceSecretKey").isLength({ min: 56 }),
    body("destinationPublicKey").isLength({ min: 56, max: 56 }),
    body("amount").isDecimal({ decimal_digits: "0,7" }),
    body("asset").optional().isString(),
    body("memo").optional().isString().isLength({ max: 28 }),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const result = await stellar.sendPayment(req.body);
        res.json({ hash: result.hash, successful: result.successful });
      } catch (err) {
        next(err);
      }
    }
  );

  walletRouter.post("/keypair", async (req, res, next) => {
    try {
      const keypair = stellar.generateKeypair();
      const publicKey = keypair.publicKey();
      const secretKey = keypair.secret();

      await logKeypairIssuance(req.header("x-api-key") ?? "", publicKey);

      res.json({
        publicKey,
        // NOTE: secret is returned only once — store it securely on the client
        secretKey,
      });
    } catch (err) {
      next(err);
    }
  });

  return walletRouter;
}
