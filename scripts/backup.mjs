// Copy the production database into a local SQLite file, so a copy lives somewhere other than Turso.
// .github/workflows/backup.yml runs it daily and keeps the result as a workflow artifact.
// Usage: TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… node scripts/backup.mjs <out-dir>
// Restore with `turso db create <name> --from-file <out-dir>/simple-tests.db`.
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";

const out = process.argv[2];
const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN } = process.env;
if (!out || !TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN) {
  console.error("Usage: TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… node scripts/backup.mjs <out-dir>");
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const dbFile = join(out, "simple-tests.db");
if (existsSync(dbFile)) throw new Error(`${dbFile} already exists`);
const remote = createClient({ url: TURSO_DATABASE_URL, authToken: TURSO_AUTH_TOKEN });
const local = createClient({ url: `file:${dbFile}` });
const schema = (
  await remote.execute(
    `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`
  )
).rows;
// Shadow tables of any virtual (e.g. FTS) table are left to SQLite, which fills them as rows go into the virtual table.
const virtual = new Set(schema.filter((s) => /^CREATE VIRTUAL TABLE/i.test(s.sql)).map((s) => s.name));
const shadow = (name) => [...virtual].some((v) => name.startsWith(`${v}_`));
const tables = schema.filter((s) => s.type === "table" && !shadow(s.name));
// Tables are copied in whatever order sqlite_master lists them, so a row may arrive before the row it references.
await local.execute("PRAGMA foreign_keys = OFF");
for (const t of tables) await local.execute(t.sql);

// Tables are copied row by row in pages, keyed on rowid.
const PAGE = 500;
// Live credentials stay out of the copy (anyone who can read the repo can download an artifact): these tables are
// created empty, so after a restore MCP clients and API users sign in again.
const SECRET = new Set(["oauth_access_tokens", "oauth_refresh_tokens", "oauth_authorization_codes", "api_tokens"]);
const counts = {};
for (const { name } of tables) {
  if (SECRET.has(name)) {
    console.log(`${name}: skipped`);
    continue;
  }
  let copied = 0;
  for (let after = -9223372036854775808n; ; ) {
    const rs = await remote.execute({
      sql: `SELECT rowid AS _rowid, * FROM "${name}" WHERE rowid > ? ORDER BY rowid LIMIT ${PAGE}`,
      args: [after],
    });
    if (!rs.rows.length) break;
    after = rs.rows.at(-1)[0];
    const cols = rs.columns.slice(1);
    const sql = `INSERT INTO "${name}" (rowid, ${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${["?", ...cols.map(() => "?")].join(", ")})`;
    await local.batch(rs.rows.map((r) => ({ sql, args: rs.columns.map((_, i) => r[i]) })), "write");
    copied += rs.rows.length;
  }
  counts[name] = copied;
  console.log(`${name}: ${copied} rows`);
}
// Indexes and triggers go in last so the copy doesn't fire or maintain them row by row.
for (const s of schema.filter((s) => s.type !== "table" && !shadow(s.tbl_name || s.name))) await local.execute(s.sql);
const check = (await local.execute("PRAGMA integrity_check")).rows[0][0];
if (check !== "ok") throw new Error(`integrity_check: ${check}`);
local.close();
writeFileSync(join(out, "manifest.json"), JSON.stringify({ at: new Date().toISOString(), tables: counts }, null, 2));
console.log("done");
