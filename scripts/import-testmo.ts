import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { parse } from "csv-parse/sync";
import * as he from "he";
import * as fs from "fs";
import * as path from "path";
import * as schema from "../src/lib/db/schema";

// Load environment variables
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  });
}

const dbUrl = process.env.TURSO_DATABASE_URL || "file:local.db";
const isLocal = dbUrl === "file:local.db" || !process.env.TURSO_DATABASE_URL;

const client = createClient({
  url: dbUrl,
  authToken: isLocal ? undefined : process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

interface TestmoRow {
  "Case ID": string;
  Case: string;
  Automation: string;
  "Created at": string;
  "Created by": string;
  Description: string;
  Folder: string;
  Priority: string;
  "Scenarios (Step)": string;
  State: string;
  "Status (latest)": string;
  Template: string;
  "Updated at": string;
  "Updated by": string;
}

function extractGherkinFromHtml(html: string): string {
  if (!html) return "";

  // Decode HTML entities
  let text = he.decode(html);

  // Remove HTML tags but keep content
  text = text.replace(/<pre><code[^>]*>/g, "");
  text = text.replace(/<\/code><\/pre>/g, "\n\n");
  text = text.replace(/<[^>]+>/g, "");

  // Clean up whitespace
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

function mapState(state: string): "active" | "draft" | "retired" | "rejected" {
  const normalized = state.toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "draft") return "draft";
  if (normalized === "retired") return "retired";
  if (normalized === "rejected") return "rejected";
  return "active";
}

function mapTemplate(template: string): "bdd_feature" | "steps" | "text" {
  const normalized = template.toLowerCase();
  if (normalized.includes("bdd") || normalized.includes("feature"))
    return "bdd_feature";
  if (normalized.includes("step")) return "steps";
  return "text";
}

async function importTestmo(csvPath: string) {
  console.log(`Reading CSV from: ${csvPath}`);

  let csvContent = fs.readFileSync(csvPath, "utf-8");
  // Remove UTF-8 BOM if present
  if (csvContent.charCodeAt(0) === 0xfeff) {
    csvContent = csvContent.slice(1);
  }
  const records: TestmoRow[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`Found ${records.length} test cases to import`);

  // Extract unique folders
  const folderNames = new Set<string>();
  records.forEach((row) => {
    if (row.Folder) {
      folderNames.add(row.Folder.trim());
    }
  });

  console.log(`Found ${folderNames.size} unique folders`);

  // Create folders
  const folderMap = new Map<string, number>();
  let folderOrder = 0;

  for (const name of Array.from(folderNames)) {
    const result = await db
      .insert(schema.folders)
      .values({
        name,
        parentId: null,
        order: folderOrder++,
      })
      .returning({ id: schema.folders.id });

    folderMap.set(name, result[0].id);
  }

  console.log(`Created ${folderMap.size} folders`);

  // Import test cases
  let imported = 0;
  let skipped = 0;

  for (const row of records) {
    try {
      const title = row.Case?.trim();
      if (!title) {
        skipped++;
        continue;
      }

      const gherkin = extractGherkinFromHtml(row["Scenarios (Step)"] || "");
      const folderId = row.Folder ? folderMap.get(row.Folder.trim()) : null;

      await db.insert(schema.testCases).values({
        legacyId: row["Case ID"] || null,
        title,
        folderId: folderId || null,
        gherkin,
        template: mapTemplate(row.Template || ""),
        state: mapState(row.State || ""),
        priority: "normal",
        createdAt: row["Created at"] ? new Date(row["Created at"]) : new Date(),
        updatedAt: row["Updated at"] ? new Date(row["Updated at"]) : new Date(),
      });

      imported++;

      if (imported % 100 === 0) {
        console.log(`Imported ${imported} test cases...`);
      }
    } catch (error) {
      console.error(`Failed to import case: ${row.Case}`, error);
      skipped++;
    }
  }

  console.log(`\nImport complete!`);
  console.log(`- Imported: ${imported} test cases`);
  console.log(`- Skipped: ${skipped} test cases`);
  console.log(`- Folders: ${folderMap.size}`);
}

// Get CSV path from command line or use default
const csvPath = process.argv[2] || "./testmo-export-repository-1.csv";
const absolutePath = path.resolve(csvPath);

if (!fs.existsSync(absolutePath)) {
  console.error(`CSV file not found: ${absolutePath}`);
  process.exit(1);
}

importTestmo(absolutePath)
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Import failed:", error);
    process.exit(1);
  });
