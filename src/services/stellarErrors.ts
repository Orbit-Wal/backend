/**
 * Thrown when Horizon rejects a submission with tx_bad_seq: the source
 * account's sequence number moved between when we read it and when the
 * transaction landed. With the per-account lock in place this should be
 * rare (it means something outside this process's lock also submitted for
 * this account — e.g. another deployed instance without a shared Redis
 * lock, or the key being used elsewhere) but callers still need a clear,
 * actionable signal rather than a raw Horizon error blob.
 */
export class SequenceConflictError extends Error {
  readonly name = "SequenceConflictError";
  readonly code = "SEQUENCE_CONFLICT" as const;
  readonly retryable = true;

  constructor(message: string, readonly horizonResultCodes?: unknown) {
    super(message);
  }
}

/**
 * Thrown when the destination account requires a memo (SEP-29) but no memo
 * was provided. This prevents accidental fund loss when sending to
 * custodial/exchange accounts that rely on the memo to credit deposits.
 */
export class MemoRequiredError extends Error {
  readonly name = "MemoRequiredError";
  readonly code = "MEMO_REQUIRED" as const;
  readonly retryable = false;
}

/** Thrown when a distributed (e.g. Redis) account lock can't be acquired in time. */
export class LockAcquisitionError extends Error {
  readonly name = "LockAcquisitionError";
  readonly code = "LOCK_TIMEOUT" as const;
  readonly retryable = true;
}
