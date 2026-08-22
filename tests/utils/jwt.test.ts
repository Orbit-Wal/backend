import { generateRefreshToken, revokeRefreshToken, rotateRefreshToken, getRefreshTokenSub, refreshStore } from "../../src/utils/jwt";

describe("jwt utils", () => {
  beforeEach(() => {
    refreshStore.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should not accumulate revoked tokens in memory", () => {
    for (let i = 0; i < 100; i++) {
      const t = generateRefreshToken("user-" + i);
      revokeRefreshToken(t);
    }
    expect(refreshStore.size).toBe(0); // Revoked tokens are deleted immediately
  });

  it("should sweep expired tokens periodically", () => {
    const t = generateRefreshToken("user-123");
    expect(refreshStore.size).toBe(1);

    // Fast-forward past the expiry (7 days)
    jest.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1000);
    
    // Fast-forward another 5 minutes to trigger the sweep
    jest.advanceTimersByTime(5 * 60 * 1000);
    
    expect(refreshStore.size).toBe(0);
  });
});
