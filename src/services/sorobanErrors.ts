/** Thrown when a Soroban contract route is called before its contract ID is configured. */
export class SorobanNotConfiguredError extends Error {
  readonly name = "SorobanNotConfiguredError";
  readonly code = "SOROBAN_NOT_CONFIGURED" as const;
  readonly retryable = false;

  constructor(message = "Soroban contract integration is not configured (missing contract ID)") {
    super(message);
  }
}

/**
 * Thrown when `simulateTransaction` reports a failure. The transaction is
 * never submitted in this case — this is the "cheap failure" path: bad
 * arguments, a contract error (e.g. a spend-limit rejection), or a missing
 * `require_auth()` grant are all caught here for the cost of a read, before
 * any fee is paid or a real invocation is attempted.
 */
export class SorobanSimulationError extends Error {
  readonly name = "SorobanSimulationError";
  readonly code = "SOROBAN_SIMULATION_FAILED" as const;
  readonly retryable = false;

  constructor(message: string, readonly raw?: string) {
    super(message);
  }
}

/**
 * Thrown when a transaction that passed simulation still lands as FAILED
 * on-chain (e.g. contract state changed between simulate and submit). Rare
 * by design, since simulation already screens out the common failure modes.
 */
export class SorobanTransactionError extends Error {
  readonly name = "SorobanTransactionError";
  readonly code = "SOROBAN_TX_FAILED" as const;
  readonly retryable = false;

  constructor(message: string, readonly hash: string) {
    super(message);
  }
}
