// config.ts validates and parses process.env at import time — every test
// file that (transitively) imports it needs these set first.
process.env.PORT ??= "4000";
process.env.HORIZON_URL ??= "https://horizon-testnet.stellar.org";
process.env.NETWORK_PASSPHRASE ??= "Test SDF Network ; September 2015";
process.env.CORS_ORIGIN ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.JWT_SECRET ??= "test-jwt-secret";
process.env.API_KEY ??= "test-api-key";
process.env.LOCK_BACKEND ??= "in-process";
