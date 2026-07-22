import { Router } from "express";
import { param, validationResult } from "express-validator";
import { StellarService } from "../services/stellar";

/**
 * Custom validator: rejects Muxed (M...) addresses.
 * Horizon's REST API does not accept M-addresses in path segments — passing
 * them through results in an opaque Horizon failure. We reject early with a
 * clear 400 explaining why.
 */
function isGAddress(value: string): boolean {
  if (typeof value !== "string") return false;
  return value.startsWith("G") && value.length === 56;
}

export function createAccountRouter(stellar: StellarService): Router {
  const accountRouter = Router();

  accountRouter.get(
    "/:publicKey",
    param("publicKey").custom((value) => {
      if (!isGAddress(value)) {
        throw new Error(
          "Invalid public key: only G... addresses are supported. " +
            "Muxed (M...) addresses are not accepted — use the underlying G... address instead."
        );
      }
      return true;
    }),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const account = await stellar.getAccount(req.params.publicKey);
        res.json(account);
      } catch (err) {
        next(err);
      }
    }
  );

  accountRouter.get(
    "/:publicKey/balances",
    param("publicKey").custom((value) => {
      if (!isGAddress(value)) {
        throw new Error(
          "Invalid public key: only G... addresses are supported. " +
            "Muxed (M...) addresses are not accepted — use the underlying G... address instead."
        );
      }
      return true;
    }),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const balances = await stellar.getBalances(req.params.publicKey);
        res.json({ balances });
      } catch (err) {
        next(err);
      }
    }
  );

  accountRouter.get(
    "/:publicKey/transactions",
    param("publicKey").custom((value) => {
      if (!isGAddress(value)) {
        throw new Error(
          "Invalid public key: only G... addresses are supported. " +
            "Muxed (M...) addresses are not accepted — use the underlying G... address instead."
        );
      }
      return true;
    }),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const cursor = req.query.cursor as string | undefined;
        const result = await stellar.getTransactions(req.params.publicKey, { limit, cursor });
        res.json({ 
          transactions: result.transactions,
          next: result.next,
          hasMore: result.hasMore,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return accountRouter;
}
