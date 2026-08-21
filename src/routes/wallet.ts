import { Router } from "express";
import { body, param } from "express-validator";
import { jwtAuth } from "../middleware/jwtAuth";
import { assertValidRequest } from "../middleware/requestValidation";
import { logKeypairIssuance } from "../services/auditLog";
import { StellarService } from "../services/stellar";
import { validatePathAssets } from "../validation/stellarAsset";

function isGAddress(value: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return value.startsWith("G") && value.length === 56;
}

const destinationMessage =
  "Invalid destination: only G... addresses are supported. Muxed (M...) addresses are not accepted; use the underlying G... address instead.";
const publicKeyMessage =
  "Invalid public key: only G... addresses are supported. Muxed (M...) addresses are not accepted; use the underlying G... address instead.";

export function createWalletRouter(stellar: StellarService): Router {
  const walletRouter = Router();

  walletRouter.use(jwtAuth);

  walletRouter.post(
    "/send",
    body("sourceSecretKey").isLength({ min: 56 }),
    body("destinationPublicKey")
      .isLength({ min: 56, max: 56 })
      .bail()
      .custom(isGAddress)
      .withMessage(destinationMessage),
    body("amount").isDecimal({ decimal_digits: "0,7" }),
    body("asset").optional().isString(),
    body("memo").optional().isString().isLength({ max: 28 }),
    async (req, res, next) => {
      try {
        assertValidRequest(req);
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
    async (req, res, next) => {
      try {
        assertValidRequest(req);
        const result = await stellar.feeBumpTransaction(req.body);
        res.json({ hash: result.hash, successful: result.successful });
      } catch (err) {
        next(err);
      }
    }
  );

  walletRouter.post(
    "/path-payment-strict-send",
    body("sourceSecretKey").isLength({ min: 56 }),
    body("destinationPublicKey")
      .isLength({ min: 56, max: 56 })
      .bail()
      .custom(isGAddress)
      .withMessage(destinationMessage),
    body("sendAmount").isDecimal({ decimal_digits: "0,7" }),
    body("destAsset").isString(),
    body("destMin").isDecimal({ decimal_digits: "0,7" }),
    body("path").optional().custom((path: unknown) => {
      if (!Array.isArray(path)) {
        throw new Error("Path must be an array");
      }
      validatePathAssets(path);
      return true;
    }),
    body("memo").optional().isString().isLength({ max: 28 }),
    async (req, res, next) => {
      try {
        assertValidRequest(req);
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
    body("destinationPublicKey")
      .isLength({ min: 56, max: 56 })
      .bail()
      .custom(isGAddress)
      .withMessage(destinationMessage),
    body("destAmount").isDecimal({ decimal_digits: "0,7" }),
    body("destAsset").isString(),
    body("sendMax").isDecimal({ decimal_digits: "0,7" }),
    body("path").optional().custom((path: unknown) => {
      if (!Array.isArray(path)) {
        throw new Error("Path must be an array");
      }
      validatePathAssets(path);
      return true;
    }),
    body("memo").optional().isString().isLength({ max: 28 }),
    async (req, res, next) => {
      try {
        assertValidRequest(req);
        const result = await stellar.pathPaymentStrictReceive(req.body);
        res.json({ hash: result.hash, successful: result.successful });
      } catch (err) {
        next(err);
      }
    }
  );

  walletRouter.post(
    "/paths/strict-send",
    body("sourceAmount").isDecimal({ decimal_digits: "0,7" }),
    body("sourceAsset").optional().isString(),
    body("destinationAsset").isString(),
    body("destinationPublicKey")
      .optional()
      .isLength({ min: 56, max: 56 })
      .bail()
      .custom(isGAddress)
      .withMessage(destinationMessage),
    async (req, res, next) => {
      try {
        assertValidRequest(req);
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
    body("destinationPublicKey")
      .optional()
      .isLength({ min: 56, max: 56 })
      .bail()
      .custom(isGAddress)
      .withMessage(destinationMessage),
    async (req, res, next) => {
      try {
        assertValidRequest(req);
        const paths = await stellar.findStrictReceivePaths(req.body);
        res.json({ paths });
      } catch (err) {
        next(err);
      }
    }
  );

  walletRouter.post(
    "/partial-transaction",
    body("sourceSecretKey").isLength({ min: 56 }),
    body("destinationPublicKey")
      .isLength({ min: 56, max: 56 })
      .bail()
      .custom(isGAddress)
      .withMessage(destinationMessage),
    body("amount").isDecimal({ decimal_digits: "0,7" }),
    body("asset").optional().isString(),
    body("memo").optional().isString().isLength({ max: 28 }),
    async (req, res, next) => {
      try {
        assertValidRequest(req);
        const result = await stellar.buildPartialTransaction(req.body);
        res.json({ xdr: result.xdr, hash: result.hash });
      } catch (err) {
        next(err);
      }
    }
  );

  walletRouter.post(
    "/submit-multisig",
    body("xdr").isString(),
    body("signerSecretKeys").isArray({ min: 1 }),
    async (req, res, next) => {
      try {
        assertValidRequest(req);
        const result = await stellar.submitWithAdditionalSignatures(req.body);
        res.json({ hash: result.hash, successful: result.successful });
      } catch (err) {
        next(err);
      }
    }
  );

  walletRouter.get(
    "/:publicKey/thresholds",
    param("publicKey").custom(isGAddress).withMessage(publicKeyMessage),
    async (req, res, next) => {
      try {
        assertValidRequest(req);
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
      res.json({ publicKey, secretKey });
    } catch (err) {
      next(err);
    }
  });

  return walletRouter;
}
