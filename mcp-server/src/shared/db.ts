import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema.js";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default to the local.db in the parent project directory
const defaultDbPath = `file:${resolve(__dirname, "../../../local.db")}`;

const isLocal =
  !process.env.TURSO_DATABASE_URL ||
  process.env.TURSO_DATABASE_URL === "file:local.db" ||
  process.env.TURSO_DATABASE_URL.startsWith("file:");

const dbUrl = process.env.TURSO_DATABASE_URL || defaultDbPath;

const client = createClient({
  url: dbUrl,
  authToken: isLocal ? undefined : process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export { schema };
