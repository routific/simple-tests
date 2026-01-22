import { defineConfig } from "drizzle-kit";

const isLocal = !process.env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL === "file:local.db";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: isLocal ? "sqlite" : "turso",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL || "file:local.db",
    authToken: isLocal ? undefined : process.env.TURSO_AUTH_TOKEN,
  },
});
