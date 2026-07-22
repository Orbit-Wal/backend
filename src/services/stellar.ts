import * as StellarSdk from "@stellar/stellar-sdk";
import { config } from "../config";
import { AccountLock, InProcessAccountLock } from "./locks/accountLock";
import {
  SequenceConflictError,
  NonRetryableHorizonError,
} from "./stellarErrors";

export interface TransactionSummary {
  id: string;
  hash: string;
  ledger: number;
  created_at: string;
  operation_count: number;
  memo: string | undefined;
}

/** Maximum number of tx_bad_seq retries before giving up. */
const MAX_SEQ_RETRIES = 3;

/** How many ms to pause between retries (exponential back-off seed). */
const RETRY_BASE_DELAY_MS = 200;

export class StellarService {
  private server: StellarSdk.Horizon.Server;
  private networkPassphrase: string;
  private readonly accountLock: AccountLock;

  constructor(accountLock: AccountLock = new InProcessAccountLock()) {
    this.networkPassphrase = config.NETWORK_PASSPHRASE;
    this.server = new StellarSdk.Horizon.Server(config.HORIZON_URL);
    this.accountLock = accountLock;
  }

  generateKeypair(): StellarSdk.Keypair {
    return StellarSdk.Keypair.random();
  }

  async getAccount(publicKey: string) {
    return this.server.loadAccount(publicKey);
  }

  async getBalances(publicKey: string): Promise<Record<string, string>> {
    const account = await this.getAccount(publicKey);
    const result: Record<string, string> = {};
    for (const b of account.balances) {
      if (b.asset_type === "native") result["XLM"] = b.balance;
      else if ("asset_code" in b) result[b.asset_code] = b.balance;
    }
    return result;
  }

  async getTransactions(
    publicKey: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{
    transactions: TransactionSummary[];
    next: string | undefined;
    hasMore: boolean;
  }>;
  async getTransactions(publicKey: string, limit: number): Promise<TransactionSummary[]>;
  async getTransactions(
    publicKey: string,
    optionsOrLimit?: { limit?: number; cursor?: string } | number
  ) {
    let limit = 20;
    let cursor: string | undefined;
    if (typeof optionsOrLimit === "number") {
      limit = optionsOrLimit;
    } else if (typeof optionsOrLimit === "object" && optionsOrLimit !== null) {
      limit = optionsOrLimit.limit ?? 20;
      cursor = optionsOrLimit.cursor;
    }

    let builder = this.server
      .transactions()
      .forAccount(publicKey)
      .limit(limit)
      .order("desc");
    if (cursor) {
      builder = builder.cursor(cursor);
    }
    const records = await builder.call();
    const transactions: TransactionSummary[] = records.records.map((tx) => ({
      id: tx.id,
      hash: tx.hash,
      ledger: tx.ledger_attr,
      created_at: tx.created_at,
      operation_count: tx.operation_count,
      memo: tx.memo,
    }));
    const lastRecord = records.records[records.records.length - 1];
    const result = {
      transactions,
      next: lastRecord ? (lastRecord as unknown as { paging_token: string }).paging_token : undefined,
      hasMore: records.records.length === limit,
    };

    if (typeof optionsOrLimit === "number") {
      return transactions;
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  //  Issue #9 – Automatic resubmission after tx_bad_seq
  // ---------------------------------------------------------------------------
  // When Horizon rejects a submission with tx_bad_seq the source account's
  // sequence number moved between read and submission.  Rather than surfacing
  // a raw error we re-fetch the account, rebuild the transaction from the
  // fresh sequence number and try again – bounded to MAX_SEQ_RETRIES attempts
  // with exponential back-off.  Any *other* Horizon result code (e.g.
  // op_underfunded) is never retried because it indicates a deterministic
  // failure that a fresh sequence number cannot fix.
  // ---------------------------------------------------------------------------

  async sendPayment(params: {
    sourceSecretKey: string;
    destinationPublicKey: string;
    amount: string;
    asset?: string;
    memo?: string;
  }) {
    const { sourceSecretKey, destinationPublicKey, amount, asset, memo } = params;
    const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);
    const sourcePublicKey = sourceKeypair.publicKey();

    return this.accountLock.withLock(sourcePublicKey, async () => {
      let lastAttemptError: unknown;
      for (let attempt = 0; attempt <= MAX_SEQ_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(
            `[stellar] tx_bad_seq retry ${attempt}/${MAX_SEQ_RETRIES} ` +
              `for ${sourcePublicKey} — waiting ${delay}ms before resubmit`
          );
          await new Promise((r) => setTimeout(r, delay));
        }

        const sourceAccount = await this.getAccount(sourcePublicKey);
        const stellarAsset =
          !asset || asset === "XLM"
            ? StellarSdk.Asset.native()
            : new StellarSdk.Asset(asset.split(":")[0], asset.split(":")[1]);
        const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase: this.networkPassphrase,
        })
          .addOperation(
            StellarSdk.Operation.payment({
              destination: destinationPublicKey,
              asset: stellarAsset,
              amount,
            })
          )
          .setTimeout(30);
        if (memo) builder.addMemo(StellarSdk.Memo.text(memo));
        const tx = builder.build();
        tx.sign(sourceKeypair);

        try {
          const result = await this.server.submitTransaction(tx);
          if (attempt > 0) {
            console.log(
              `[stellar] tx_bad_seq retry ${attempt}/${MAX_SEQ_RETRIES} ` +
                `succeeded for ${sourcePublicKey}`
            );
          }
          return result;
        } catch (err) {
          if (isTxBadSeq(err) && attempt < MAX_SEQ_RETRIES) {
            lastAttemptError = err;
            continue;
          }
          throw translateSubmissionError(err, sourcePublicKey);
        }
      }
      // All retries exhausted — throw the last SequenceConflictError so the
      // caller sees a clear, actionable error rather than an undefined result.
      throw translateSubmissionError(lastAttemptError, sourcePublicKey);
    });
  }

  // ---------------------------------------------------------------------------
  //  Issue #7 – Path payments (strict-send / strict-receive)
  // ---------------------------------------------------------------------------

  async pathPaymentStrictSend(params: {
    sourceSecretKey: string;
    destinationPublicKey: string;
    sendAmount: string;
    destAsset: string;
    destMin: string;
    path?: string[];
    memo?: string;
  }) {
    const {
      sourceSecretKey,
      destinationPublicKey,
      sendAmount,
      destAsset,
      destMin,
      path,
      memo,
    } = params;
    const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);
    const sourcePublicKey = sourceKeypair.publicKey();

    return this.accountLock.withLock(sourcePublicKey, async () => {
      let lastAttemptError: unknown;
      for (let attempt = 0; attempt <= MAX_SEQ_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(
            `[stellar] pathPaymentStrictSend tx_bad_seq retry ${attempt}/${MAX_SEQ_RETRIES} ` +
              `for ${sourcePublicKey} — waiting ${delay}ms`
          );
          await new Promise((r) => setTimeout(r, delay));
        }

        const sourceAccount = await this.getAccount(sourcePublicKey);
        const destinationAsset = parseAsset(destAsset);
        const strictSendPath = (path ?? []).map(parseAsset);

        const op = StellarSdk.Operation.pathPaymentStrictSend({
          destination: destinationPublicKey,
          sendAsset: StellarSdk.Asset.native(),
          sendAmount,
          destAsset: destinationAsset,
          destMin,
          path: strictSendPath,
        });

        const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase: this.networkPassphrase,
        }).addOperation(op).setTimeout(30);

        if (memo) builder.addMemo(StellarSdk.Memo.text(memo));

        const tx = builder.build();
        tx.sign(sourceKeypair);

        try {
          const result = await this.server.submitTransaction(tx);
          if (attempt > 0) {
            console.log(
              `[stellar] pathPaymentStrictSend tx_bad_seq retry ${attempt}/${MAX_SEQ_RETRIES} ` +
                `succeeded for ${sourcePublicKey}`
            );
          }
          return result;
        } catch (err) {
          if (isTxBadSeq(err) && attempt < MAX_SEQ_RETRIES) {
            lastAttemptError = err;
            continue;
          }
          throw translateSubmissionError(err, sourcePublicKey);
        }
      }
      throw translateSubmissionError(lastAttemptError, sourcePublicKey);
    });
  }

  async pathPaymentStrictReceive(params: {
    sourceSecretKey: string;
    destinationPublicKey: string;
    destAmount: string;
    destAsset: string;
    sendMax: string;
    path?: string[];
    memo?: string;
  }) {
    const {
      sourceSecretKey,
      destinationPublicKey,
      destAmount,
      destAsset,
      sendMax,
      path,
      memo,
    } = params;
    const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);
    const sourcePublicKey = sourceKeypair.publicKey();

    return this.accountLock.withLock(sourcePublicKey, async () => {
      let lastAttemptError: unknown;
      for (let attempt = 0; attempt <= MAX_SEQ_RETRIES; attempt++) {
        if (attempt > 0) {
          const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.log(
            `[stellar] pathPaymentStrictReceive tx_bad_seq retry ${attempt}/${MAX_SEQ_RETRIES} ` +
              `for ${sourcePublicKey} — waiting ${delay}ms`
          );
          await new Promise((r) => setTimeout(r, delay));
        }

        const sourceAccount = await this.getAccount(sourcePublicKey);
        const destinationAsset = parseAsset(destAsset);
        const strictReceivePath = (path ?? []).map(parseAsset);

        const op = StellarSdk.Operation.pathPaymentStrictReceive({
          destination: destinationPublicKey,
          sendAsset: StellarSdk.Asset.native(),
          sendMax,
          destAsset: destinationAsset,
          destAmount,
          path: strictReceivePath,
        });

        const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase: this.networkPassphrase,
        }).addOperation(op).setTimeout(30);

        if (memo) builder.addMemo(StellarSdk.Memo.text(memo));

        const tx = builder.build();
        tx.sign(sourceKeypair);

        try {
          const result = await this.server.submitTransaction(tx);
          if (attempt > 0) {
            console.log(
              `[stellar] pathPaymentStrictReceive tx_bad_seq retry ${attempt}/${MAX_SEQ_RETRIES} ` +
                `succeeded for ${sourcePublicKey}`
            );
          }
          return result;
        } catch (err) {
          if (isTxBadSeq(err) && attempt < MAX_SEQ_RETRIES) {
            lastAttemptError = err;
            continue;
          }
          throw translateSubmissionError(err, sourcePublicKey);
        }
      }
      throw translateSubmissionError(lastAttemptError, sourcePublicKey);
    });
  }

  // ---------------------------------------------------------------------------
  //  Issue #7 helper – Horizon path-finding
  // ---------------------------------------------------------------------------

  async findStrictSendPaths(params: {
    sourceAmount: string;
    sourceAsset?: string;
    destinationAsset: string;
    destinationPublicKey?: string;
  }): Promise<unknown[]> {
    const { sourceAmount, sourceAsset, destinationAsset, destinationPublicKey } = params;
    const srcAsset = sourceAsset ? parseAsset(sourceAsset) : StellarSdk.Asset.native();
    const destAst = parseAsset(destinationAsset);

    const query = this.server
      .paths()
      .strictSend({
        source_asset: srcAsset.isNative() ? undefined : srcAsset,
        source_amount: sourceAmount,
      })
      .strictReceive(destinationAsset, destAst.isNative() ? undefined : destAst)
      .destinationAccount(destinationPublicKey ?? config.HORIZON_URL)
      .limit(5);

    const result = await query.call();
    return result.records as unknown[];
  }

  async findStrictReceivePaths(params: {
    destinationAmount: string;
    destinationAsset: string;
    sourceAsset?: string;
    destinationPublicKey?: string;
  }): Promise<unknown[]> {
    const { destinationAmount, destinationAsset, sourceAsset, destinationPublicKey } = params;
    const destAst = parseAsset(destinationAsset);
    const srcAsset = sourceAsset ? parseAsset(sourceAsset) : StellarSdk.Asset.native();

    const query = this.server
      .paths()
      .strictReceive({
        destination_asset: destAst.isNative() ? undefined : destAst,
        destination_amount: destinationAmount,
      })
      .strictSend(sourceAsset, srcAsset.isNative() ? undefined : srcAsset)
      .destinationAccount(destinationPublicKey ?? config.HORIZON_URL)
      .limit(5);

    const result = await query.call();
    return result.records as unknown[];
  }

  // ---------------------------------------------------------------------------
  //  Issue #8 – Multi-signature / threshold signing
  // ---------------------------------------------------------------------------

  /**
   * Builds a payment transaction, signs it with the provided secret key, and
   * returns the base64-encoded XDR so that co-signers can add their
   * signatures before final submission.
   */
  async buildPartialTransaction(params: {
    sourceSecretKey: string;
    destinationPublicKey: string;
    amount: string;
    asset?: string;
    memo?: string;
  }): Promise<{ xdr: string; hash: string }> {
    const { sourceSecretKey, destinationPublicKey, amount, asset, memo } = params;
    const sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);
    const sourcePublicKey = sourceKeypair.publicKey();

    return this.accountLock.withLock(sourcePublicKey, async () => {
      const sourceAccount = await this.getAccount(sourcePublicKey);
      const stellarAsset = parseAsset(asset);

      const builder = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: destinationPublicKey,
            asset: stellarAsset,
            amount,
          })
        )
        .setTimeout(30);

      if (memo) builder.addMemo(StellarSdk.Memo.text(memo));

      const tx = builder.build();
      tx.sign(sourceKeypair);

      return {
        xdr: tx.toXDR(),
        hash: tx.hash().toString("hex"),
      };
    });
  }

  /**
   * Merges additional signer signatures into a partially-signed transaction
   * XDR and submits the result to Horizon.  Callers provide the base64 XDR
   * returned by `buildPartialTransaction` plus one or more additional
   * secret keys whose signatures satisfy the remaining threshold weight.
   */
  async submitWithAdditionalSignatures(params: {
    xdr: string;
    signerSecretKeys: string[];
  }): Promise<StellarSdk.Horizon.HorizonApi.SubmitTransactionResponse> {
    const { xdr, signerSecretKeys } = params;
    const tx = new StellarSdk.Transaction(xdr, this.networkPassphrase);

    for (const sk of signerSecretKeys) {
      tx.sign(StellarSdk.Keypair.fromSecret(sk));
    }

    try {
      return await this.server.submitTransaction(tx);
    } catch (err) {
      const sourcePublicKey = tx.source;
      throw translateSubmissionError(err, sourcePublicKey);
    }
  }

  /**
   * Returns threshold information for the given account so callers can
   * determine how many additional signers are required before a
   * multi-sig transaction can be submitted.
   */
  async getAccountThresholds(publicKey: string): Promise<{
    lowThreshold: number;
    mediumThreshold: number;
    highThreshold: number;
    signers: Array<{ key: string; weight: number }>;
  }> {
    const account = await this.getAccount(publicKey);
    return {
      lowThreshold: account.thresholds.low_threshold,
      mediumThreshold: account.thresholds.med_threshold,
      highThreshold: account.thresholds.high_threshold,
      signers: (account as unknown as { signers?: Array<{ key: string; weight: number }> }).signers ?? [],
    };
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function parseAsset(assetStr: string | undefined): StellarSdk.Asset {
  if (!assetStr || assetStr === "XLM") return StellarSdk.Asset.native();
  const [code, issuer] = assetStr.split(":");
  return new StellarSdk.Asset(code, issuer);
}

function isTxBadSeq(err: unknown): boolean {
  if (!(err instanceof StellarSdk.BadResponseError)) return false;
  const resultCodes = (err.response as { extras?: { result_codes?: unknown } } | undefined)
    ?.extras?.result_codes as { transaction?: string } | undefined;
  return resultCodes?.transaction === "tx_bad_seq";
}

function translateSubmissionError(err: unknown, sourcePublicKey: string): unknown {
  if (err instanceof StellarSdk.BadResponseError) {
    const resultCodes = (err.response as { extras?: { result_codes?: unknown } } | undefined)
      ?.extras?.result_codes as { transaction?: string; operations?: string[] } | undefined;

    if (resultCodes?.transaction === "tx_bad_seq") {
      return new SequenceConflictError(
        `Payment for account ${sourcePublicKey} was rejected because its sequence ` +
          "number changed between read and submission (tx_bad_seq). This request's " +
          "funds were NOT moved. This should be rare with in-process locking enabled " +
          "— if you're seeing it repeatedly, check whether more than one instance of " +
          "this service is running without LOCK_BACKEND=redis (see docs/concurrency.md). " +
          "Safe to retry.",
        resultCodes
      );
    }

    // Classify non-retryable Horizon errors so the caller knows the error
    // is deterministic and retrying won't help.
    const message = (err as Error).message ?? "Horizon submission failed";
    return new NonRetryableHorizonError(
      `Horizon rejected the transaction for account ${sourcePublicKey}: ${message}`,
      resultCodes
    );
  }
  return err;
}
