import * as StellarSdk from "@stellar/stellar-sdk";
import { config } from "../config";
import { AccountLock, InProcessAccountLock } from "./locks/accountLock";
import { SequenceConflictError } from "./stellarErrors";

export interface TransactionSummary {
  id: string;
  hash: string;
  ledger: number;
  created_at: string;
  operation_count: number;
  memo: string | undefined;
}

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
      // NOTE: `tx.ledger` is a HAL link-follow function (CallFunction<LedgerRecord>),
      // not the ledger sequence number — assigning it here would silently
      // disappear from the JSON response (JSON.stringify drops function
      // values). `ledger_attr` is Horizon's renamed field carrying the
      // actual number.
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

    // Two concurrent sends from the same source account both read the same
    // starting sequence number and race on submission: the loser gets a
    // bare Horizon tx_bad_seq. Serializing per source account here — load
    // account, build, sign, submit as one atomic unit of work — means each
    // submission always starts from the sequence number left behind by the
    // previous one instead of a stale read. See docs/concurrency.md for
    // why this only holds within a single process and what closes the gap
    // across multiple instances.
    return this.accountLock.withLock(sourcePublicKey, async () => {
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
        return await this.server.submitTransaction(tx);
      } catch (err) {
        throw translateSubmissionError(err, sourcePublicKey);
      }
    });
  }
}

function translateSubmissionError(err: unknown, sourcePublicKey: string): unknown {
  if (err instanceof StellarSdk.BadResponseError) {
    const resultCodes = (err.response as { extras?: { result_codes?: unknown } } | undefined)
      ?.extras?.result_codes as { transaction?: string } | undefined;

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
  }
  return err;
}
