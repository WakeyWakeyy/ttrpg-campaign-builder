import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/infrastructure/db/schema.ts",
  out: "./drizzle",
  // Generation is offline; applying migrations requires DATABASE_URL.
  dbCredentials: databaseUrl ? { url: databaseUrl } : undefined,
});
