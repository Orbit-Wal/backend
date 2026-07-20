/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/env.setup.ts"],
  roots: ["src"],
  setupFiles: ["<rootDir>/src/test-utils/setup.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: false }],
  },
};
