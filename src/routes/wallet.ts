import { Router } from "express";
import { body, validationResult } from "express-validator";
import { StellarService } from "../services/stellar";
import { logKeypairIssuance } from "../services/auditLog";
import { jwtAuth } from "../middleware/jwtAuth";

function isGAddress(value: string): boolean {
  if (typeof value !== "string") return false;
  return value.startsWith("G") && value.length === 56;
}

export function createWalletRouter(stellar: StellarService): Router {
  const walletRouter = Router();

  // Fund-movement and key-generation endpoints must never be reachable by an
  // unauthenticated caller — gate the whole router.
  walletRouter.use(jwtAuth);

  // ---------------------------------------------------------------------------
  //  Issue #9 – sendPayment with automatic tx_bad_seq retry
  // ---------------------------------------------------------------------------
  walletRouter.post(
    "/send",
    body("sourceSecretKey").isLength({ min: 56 }),
    body("destinationPublicKey")
      .isLength({ min: 56, max: 56 })
      .custom((value) => {
        if (!isGAddress(value)) {
          throw new Error(
            "Invalid destination: only G... addresses are supported. " +
              "Muxed (M...) addresses are not accepted — use the underlying G... address instead."
          );
        }
        return true;
      }),
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

  walletRouter.post(
    "/fee-bump",
    body("transactionXdr").isString().notEmpty(),
    body("feeSecretKey").isLength({ min: 56 }),
    body("fee").optional().isDecimal({ decimal_digits: "0,7" }),
  // ---------------------------------------------------------------------------
  //  Issue #7 – Path payment endpoints (strict-send / strict-receive)
  // ---------------------------------------------------------------------------
  walletRouter.post(
    "/path-payment-strict-send",
    body("sourceSecretKey").isLength({ min: 56 }),
    body("destinationPublicKey").isLength({ min: 56, max: 56 }),
    body("sendAmount").isDecimal({ decimal_digits: "0,7" }),
    body("destAsset").isString(),
    body("destMin").isDecimal({ decimal_digits: "0,7" }),
    body("path").optional().isArray(),
    body("memo").optional().isString().isLength({ max: 28 }),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const result = await stellar.feeBumpTransaction(req.body);
        const result = await stellar.pathPaymentStrictSend(req.body);
        res.json({ hash: result.hash, successful: result.successful });
      } catch (err) {
        next(err);
      }
    }
  );

  walletRouter.post(
    "/path-payment-strict-receive",
    body("sourceSecretKey").isLength({ min: 56 }),
    body("destinationPublicKey").isLength({ min: 56, max: 56 }),
    body("destAmount").isDecimal({ decimal_digits: "0,7" }),
    body("destAsset").isString(),
    body("sendMax").isDecimal({ decimal_digits: "0,7" }),
    body("path").optional().isArray(),
    body("memo").optional().isString().isLength({ max: 28 }),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const result = await stellar.pathPaymentStrictReceive(req.body);
        res.json({ hash: result.hash, successful: result.successful });
      } catch (err) {
        next(err);
      }
    }
  );

  // Issue #7 – Horizon path-finding helpers
  walletRouter.post(
    "/paths/strict-send",
    body("sourceAmount").isDecimal({ decimal_digits: "0,7" }),
    body("sourceAsset").optional().isString(),
    body("destinationAsset").isString(),
    body("destinationPublicKey").optional().isLength({ min: 56, max: 56 }),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const paths = await stellar.findStrictSendPaths(req.body);
        res.json({ paths });
      } catch (err) {
        next(err);
      }
    }
  );

  walletRouter.post(
    "/paths/strict-receive",
    body("destinationAmount").isDecimal({ decimal_digits: "0,7" }),
    body("destinationAsset").isString(),
    body("sourceAsset").optional().isString(),
    body("destinationPublicKey").optional().isLength({ min: 56, max: 56 }),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const paths = await stellar.findStrictReceivePaths(req.body);
        res.json({ paths });
      } catch (err) {
        next(err);
      }
    }
  );

  // ---------------------------------------------------------------------------
  //  Issue #8 – Multi-signature / threshold signing endpoints
  // ---------------------------------------------------------------------------

  /**
   * Builds a payment transaction, signs it with the caller's key, and
   * returns the partially-signed XDR for co-signers to add their
   * signatures.
   */
  walletRouter.post(
    "/partial-transaction",
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
        const result = await stellar.buildPartialTransaction(req.body);
        res.json({ xdr: result.xdr, hash: result.hash });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * Accepts additional signer secret keys, merges their signatures into
   * the partially-signed transaction XDR, and submits to Horizon.
   */
  walletRouter.post(
    "/submit-multisig",
    body("xdr").isString(),
    body("signerSecretKeys").isArray({ min: 1 }),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const result = await stellar.submitWithAdditionalSignatures(req.body);
        res.json({ hash: result.hash, successful: result.successful });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * Returns threshold information for an account so callers can determine
   * how many additional signers are required.
   */
  walletRouter.get(
    "/:publicKey/thresholds",
    async (req, res, next) => {
      try {
        const result = await stellar.getAccountThresholds(req.params.publicKey);
        res.json(result);
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
