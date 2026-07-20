import { Router } from "express";
import { body, validationResult } from "express-validator";
import { StellarService } from "../services/stellar";
import { apiKeyAuth } from "../middleware/apiKeyAuth";
import { logKeypairIssuance } from "../services/auditLog";

export const walletRouter = Router();
const stellar = new StellarService();

// Fund-movement and key-generation endpoints must never be reachable by an
// unauthenticated caller — gate the whole router.
walletRouter.use(apiKeyAuth);

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

    await logKeypairIssuance(
      req.header("x-api-key") ?? "",
      publicKey
    );

    res.json({
      publicKey,
      secretKey,
    });
  } catch (err) {
    next(err);
  }
});
