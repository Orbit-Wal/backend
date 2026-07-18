import { Response } from "express";
import { errorHandler } from "../../src/middleware/errorHandler";
import { LockAcquisitionError, SequenceConflictError } from "../../src/services/stellarErrors";

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe("errorHandler", () => {
  it("maps SequenceConflictError to 409 with code + retryable", () => {
    const res = mockRes();
    const err = new SequenceConflictError("sequence changed, safe to retry");

    errorHandler(err, {} as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: "sequence changed, safe to retry",
      code: "SEQUENCE_CONFLICT",
      retryable: true,
    });
  });

  it("maps LockAcquisitionError to 503 with code + retryable", () => {
    const res = mockRes();
    const err = new LockAcquisitionError("timed out waiting for lock");

    errorHandler(err, {} as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: "timed out waiting for lock",
      code: "LOCK_TIMEOUT",
      retryable: true,
    });
  });

  it("falls back to 500 for a generic error", () => {
    const res = mockRes();
    errorHandler(new Error("something else broke"), {} as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "something else broke" });
  });

  it("still maps 'Not Found' messages to 404 (no regression)", () => {
    const res = mockRes();
    errorHandler(new Error("Not Found"), {} as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
