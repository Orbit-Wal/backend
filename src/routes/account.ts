import { Router } from "express";
import { param, validationResult } from "express-validator";
import { StellarService } from "../services/stellar";

export function createAccountRouter(stellar: StellarService): Router {
  const accountRouter = Router();

  accountRouter.get(
    "/:publicKey",
    param("publicKey").isLength({ min: 56, max: 56 }),
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
    param("publicKey").isLength({ min: 56, max: 56 }),
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
    param("publicKey").isLength({ min: 56, max: 56 }),
    async (req, res, next) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const txs = await stellar.getTransactions(req.params.publicKey, limit);
        res.json({ transactions: txs });
      } catch (err) {
        next(err);
      }
    }
  );

  return accountRouter;
}
