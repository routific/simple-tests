import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const folders = sqliteTable("folders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  parentId: integer("parent_id"),
  order: integer("order").notNull().default(0),
});

export const testCases = sqliteTable("test_cases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  legacyId: text("legacy_id"),
  title: text("title").notNull(),
  folderId: integer("folder_id").references(() => folders.id),
  gherkin: text("gherkin").notNull().default(""),
  template: text("template", { enum: ["bdd_feature", "steps", "text"] })
    .notNull()
    .default("bdd_feature"),
  state: text("state", { enum: ["active", "draft", "retired", "rejected"] })
    .notNull()
    .default("active"),
  priority: text("priority", { enum: ["normal", "high", "critical"] })
    .notNull()
    .default("normal"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  createdBy: text("created_by").references(() => users.id),
  updatedBy: text("updated_by").references(() => users.id),
});

export const testRuns = sqliteTable("test_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  createdBy: text("created_by").references(() => users.id),
  status: text("status", { enum: ["in_progress", "completed"] })
    .notNull()
    .default("in_progress"),
});

export const testRunResults = sqliteTable("test_run_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  testRunId: integer("test_run_id")
    .notNull()
    .references(() => testRuns.id),
  testCaseId: integer("test_case_id")
    .notNull()
    .references(() => testCases.id),
  status: text("status", {
    enum: ["pending", "passed", "failed", "blocked", "skipped"],
  })
    .notNull()
    .default("pending"),
  notes: text("notes"),
  executedAt: integer("executed_at", { mode: "timestamp" }),
  executedBy: text("executed_by").references(() => users.id),
});

export type User = typeof users.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type TestCase = typeof testCases.$inferSelect;
export type TestRun = typeof testRuns.$inferSelect;
export type TestRunResult = typeof testRunResults.$inferSelect;
