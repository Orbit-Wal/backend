import * as StellarSdk from "@stellar/stellar-sdk";

export class StellarService {
  private server: StellarSdk.Horizon.Server;
  private networkPassphrase: string;

  constructor() {
    const horizonUrl =
      process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org";
    this.networkPassphrase =
      process.env.NETWORK_PASSPHRASE ?? StellarSdk.Networks.TESTNET;
    this.server = new StellarSdk.Horizon.Server(horizonUrl);
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

  async getTransactions(publicKey: string, limit = 20) {
    const records = await this.server
      .transactions()
      .forAccount(publicKey)
      .limit(limit)
      .order("desc")
      .call();
    return records.records.map((tx) => ({
      id: tx.id,
      hash: tx.hash,
      ledger: tx.ledger,
      created_at: tx.created_at,
      operation_count: tx.operation_count,
      memo: tx.memo,
    }));
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
    const sourceAccount = await this.getAccount(sourceKeypair.publicKey());
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
    return this.server.submitTransaction(tx);
  }
}
