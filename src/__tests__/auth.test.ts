jest.mock("../services/stellar", () => {
  const mockKeypair = {
    publicKey: () => "GABC1234",
    secret: () => "SABC1234",
  };
  return {
    StellarService: jest.fn().mockImplementation(() => ({
      generateKeypair: () => mockKeypair,
      getAccount: jest.fn(),
      getBalances: jest.fn(),
      getTransactions: jest.fn(),
      sendPayment: jest.fn(),
    })),
  };
});

import request from "supertest";
import { createApp } from "../app";

const app = createApp();

describe("POST /api/v1/auth/login", () => {
  it("returns tokens with valid API key", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("x-api-key", "test-api-key")
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.tokenType).toBe("Bearer");
  });

  it("rejects missing API key", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .expect(401);
    expect(res.body.error).toBe("Unauthorized");
  });

  it("rejects wrong API key", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .set("x-api-key", "wrong-key")
      .expect(401);
    expect(res.body.error).toBe("Unauthorized");
  });
});

describe("POST /api/v1/auth/refresh", () => {
  it("rotates tokens with valid refresh token", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("x-api-key", "test-api-key");
    const { refreshToken } = login.body;

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it("rejects already-rotated refresh token", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("x-api-key", "test-api-key");
    const { refreshToken } = login.body;

    await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(200);

    await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(401);
  });

  it("rejects empty body", async () => {
    await request(app)
      .post("/api/v1/auth/refresh")
      .send({})
      .expect(400);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("revokes refresh token so it cannot be rotated", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("x-api-key", "test-api-key");
    const { refreshToken } = login.body;

    await request(app)
      .post("/api/v1/auth/logout")
      .send({ refreshToken })
      .expect(200);

    await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken })
      .expect(401);
  });
});

describe("wallet routes with JWT", () => {
  it("rejects unauthenticated request", async () => {
    await request(app)
      .post("/api/v1/wallet/keypair")
      .expect(401);
  });

  it("accepts authenticated request with valid Bearer token", async () => {
    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("x-api-key", "test-api-key");
    const { accessToken } = login.body;

    const res = await request(app)
      .post("/api/v1/wallet/keypair")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.publicKey).toBe("GABC1234");
    expect(res.body.secretKey).toBe("SABC1234");
  });
});
