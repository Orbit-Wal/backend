import * as StellarSdk from "@stellar/stellar-sdk";
import { StellarService } from "../../src/services/stellar";

function fakeAccountResponse(publicKey: string, sequence: string) {
  return new StellarSdk.Account(publicKey, sequence) as unknown as StellarSdk.Horizon.AccountResponse;
}

describe("StellarService path payments (issue #7)", () => {
  afterEach(() => jest.restoreAllMocks());

  describe("pathPaymentStrictSend", () => {
    it("submits a strict-send path payment transaction", async () => {
      const submittedXdr: string[] = [];

      jest
        .spyOn(StellarSdk.Horizon.Server.prototype, "loadAccount")
        .mockImplementation(async (publicKey: string) => fakeAccountResponse(publicKey, "100"));

      jest
        .spyOn(StellarSdk.Horizon.Server.prototype, "submitTransaction")
        .mockImplementation(async (tx: StellarSdk.Transaction) => {
          submittedXdr.push(tx.toXDR());
          return { hash: "path-hash-1", successful: true } as unknown as StellarSdk.Horizon.HorizonApi.SubmitTransactionResponse;
        });

      const stellar = new StellarService();
      const result = await stellar.pathPaymentStrictSend({
        sourceSecretKey: StellarSdk.Keypair.random().secret(),
        destinationPublicKey: StellarSdk.Keypair.random().publicKey(),
        sendAmount: "10",
        destAsset: "USDC:GA5ZSEJYB37JDD5GULFLMUPEB7HYSF7Y5Y2GYXHJZ6UMG3XZP3WR5Y54",
        destMin: "9",
        path: ["BTCN:GBVOLD3NUNT5RYPQK7FQG7Y3JSZQ5Z3Y7B6Y5JQF5HQYJ3R2LHVK6Y6U"],
      });

      expect(result.hash).toBe("path-hash-1");
      expect(result.successful).toBe(true);
      expect(submittedXdr).toHaveLength(1);
    });

    it("retries on tx_bad_seq", async () => {
      let submitCalls = 0;

      jest
        .spyOn(StellarSdk.Horizon.Server.prototype, "loadAccount")
        .mockImplementation(async (publicKey: string) => fakeAccountResponse(publicKey, "100"));

      jest
        .spyOn(StellarSdk.Horizon.Server.prototype, "submitTransaction")
        .mockImplementation(async () => {
          submitCalls++;
          if (submitCalls === 1) {
            throw new StellarSdk.BadResponseError("fail", {
              type: "https://stellar.org/horizon-errors/transaction_failed",
              title: "Transaction Failed",
              status: 400,
              extras: { result_codes: { transaction: "tx_bad_seq" }, result_xdr: "" },
            });
          }
          return { hash: "retry-ok", successful: true } as unknown as StellarSdk.Horizon.HorizonApi.SubmitTransactionResponse;
        });

      const stellar = new StellarService();
      const result = await stellar.pathPaymentStrictSend({
        sourceSecretKey: StellarSdk.Keypair.random().secret(),
        destinationPublicKey: StellarSdk.Keypair.random().publicKey(),
        sendAmount: "10",
        destAsset: "XLM",
        destMin: "9",
      });

      expect(result.hash).toBe("retry-ok");
      expect(submitCalls).toBe(2);
    });
  });

  describe("pathPaymentStrictReceive", () => {
    it("submits a strict-receive path payment transaction", async () => {
      const submittedXdr: string[] = [];

      jest
        .spyOn(StellarSdk.Horizon.Server.prototype, "loadAccount")
        .mockImplementation(async (publicKey: string) => fakeAccountResponse(publicKey, "100"));

      jest
        .spyOn(StellarSdk.Horizon.Server.prototype, "submitTransaction")
        .mockImplementation(async (tx: StellarSdk.Transaction) => {
          submittedXdr.push(tx.toXDR());
          return { hash: "path-hash-2", successful: true } as unknown as StellarSdk.Horizon.HorizonApi.SubmitTransactionResponse;
        });

      const stellar = new StellarService();
      const result = await stellar.pathPaymentStrictReceive({
        sourceSecretKey: StellarSdk.Keypair.random().secret(),
        destinationPublicKey: StellarSdk.Keypair.random().publicKey(),
        destAmount: "5",
        destAsset: "USDC:GA5ZSEJYB37JDD5GULFLMUPEB7HYSF7Y5Y2GYXHJZ6UMG3XZP3WR5Y54",
        sendMax: "6",
      });

      expect(result.hash).toBe("path-hash-2");
      expect(result.successful).toBe(true);
      expect(submittedXdr).toHaveLength(1);
    });

    it("retries on tx_bad_seq", async () => {
      let submitCalls = 0;

      jest
        .spyOn(StellarSdk.Horizon.Server.prototype, "loadAccount")
        .mockImplementation(async (publicKey: string) => fakeAccountResponse(publicKey, "100"));

      jest
        .spyOn(StellarSdk.Horizon.Server.prototype, "submitTransaction")
        .mockImplementation(async () => {
          submitCalls++;
          if (submitCalls === 1) {
            throw new StellarSdk.BadResponseError("fail", {
              type: "https://stellar.org/horizon-errors/transaction_failed",
              title: "Transaction Failed",
              status: 400,
              extras: { result_codes: { transaction: "tx_bad_seq" }, result_xdr: "" },
            });
          }
          return { hash: "retry-ok", successful: true } as unknown as StellarSdk.Horizon.HorizonApi.SubmitTransactionResponse;
        });

      const stellar = new StellarService();
      const result = await stellar.pathPaymentStrictReceive({
        sourceSecretKey: StellarSdk.Keypair.random().secret(),
        destinationPublicKey: StellarSdk.Keypair.random().publicKey(),
        destAmount: "5",
        destAsset: "USDC:GA5ZSEJYB37JDD5GULFLMUPEB7HYSF7Y5Y2GYXHJZ6UMG3XZP3WR5Y54",
        sendMax: "6",
      });

      expect(result.hash).toBe("retry-ok");
      expect(submitCalls).toBe(2);
    });
  });
});
