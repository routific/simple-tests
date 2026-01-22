import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const isLocal = !process.env.TURSO_DATABASE_URL || process.env.TURSO_DATABASE_URL === "file:local.db";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: isLocal ? undefined : process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
