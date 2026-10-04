import { defineConfig } from "vitest/config";

if (!process.env.TEST_DATABASE_URL?.trim()) {
  throw new Error(
    "TEST_DATABASE_URL is required for integration tests. Set it in your shell to a dedicated test PostgreSQL database (see .env.example), then run pnpm test:integration. DATABASE_URL is never used as a fallback.",
  );
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
  },
});
