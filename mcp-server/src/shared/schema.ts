// Re-export schema from the main app
// Note: This file duplicates the schema for the MCP server to avoid
// complex module resolution issues. Keep in sync with src/lib/db/schema.ts

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Organizations (Linear workspaces)
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  linearUsername: text("linear_username").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizations.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const folders = sqliteTable(
  "folders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    parentId: integer("parent_id"),
    order: integer("order").notNull().default(0),
    organizationId: text("organization_id")
      .notNull()
      .default("local-dev-org")
      .references(() => organizations.id),
  },
  (table) => [index("folders_org_idx").on(table.organizationId)]
);

export const testCases = sqliteTable(
  "test_cases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    legacyId: text("legacy_id"),
    title: text("title").notNull(),
    folderId: integer("folder_id").references(() => folders.id),
    order: integer("order").notNull().default(0),
    template: text("template", { enum: ["bdd_feature", "steps", "text"] })
      .notNull()
      .default("bdd_feature"),
    state: text("state", { enum: ["active", "draft", "upcoming", "retired", "rejected"] })
      .notNull()
      .default("active"),
    priority: text("priority", { enum: ["normal", "high", "critical"] })
      .notNull()
      .default("normal"),
    organizationId: text("organization_id")
      .notNull()
      .default("local-dev-org")
      .references(() => organizations.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    createdBy: text("created_by").references(() => users.id),
    updatedBy: text("updated_by").references(() => users.id),
  },
  (table) => [index("test_cases_org_idx").on(table.organizationId)]
);

// Scenarios table - each test case has multiple scenarios
export const scenarios = sqliteTable(
  "scenarios",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    testCaseId: integer("test_case_id")
      .notNull()
      .references(() => testCases.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    gherkin: text("gherkin").notNull().default(""),
    order: integer("order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("scenarios_test_case_idx").on(table.testCaseId)]
);

export const testCaseAuditLog = sqliteTable(
  "test_case_audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    testCaseId: integer("test_case_id")
      .notNull()
      .references(() => testCases.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    action: text("action", { enum: ["created", "updated", "deleted"] }).notNull(),
    changes: text("changes").notNull(),
    previousValues: text("previous_values"),
    newValues: text("new_values"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("audit_log_test_case_idx").on(table.testCaseId)]
);

export const testRuns = sqliteTable(
  "test_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    description: text("description"),
    organizationId: text("organization_id")
      .notNull()
      .default("local-dev-org")
      .references(() => organizations.id),
    linearProjectId: text("linear_project_id"),
    linearProjectName: text("linear_project_name"),
    linearMilestoneId: text("linear_milestone_id"),
    linearMilestoneName: text("linear_milestone_name"),
    linearIssueId: text("linear_issue_id"),
    linearIssueIdentifier: text("linear_issue_identifier"),
    linearIssueTitle: text("linear_issue_title"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    createdBy: text("created_by").references(() => users.id),
    status: text("status", { enum: ["in_progress", "completed"] })
      .notNull()
      .default("in_progress"),
  },
  (table) => [index("test_runs_org_idx").on(table.organizationId)]
);

export const testRunResults = sqliteTable(
  "test_run_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    testRunId: integer("test_run_id")
      .notNull()
      .references(() => testRuns.id, { onDelete: "cascade" }),
    scenarioId: integer("scenario_id")
      .notNull()
      .references(() => scenarios.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "passed", "failed", "blocked", "skipped"],
    })
      .notNull()
      .default("pending"),
    notes: text("notes"),
    executedAt: integer("executed_at", { mode: "timestamp" }),
    executedBy: text("executed_by").references(() => users.id),
  },
  (table) => [index("test_run_results_run_idx").on(table.testRunId)]
);

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    permissions: text("permissions", { enum: ["read", "write", "admin"] })
      .notNull()
      .default("read"),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
  },
  (table) => [index("api_tokens_org_idx").on(table.organizationId)]
);

// Types
export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type TestCase = typeof testCases.$inferSelect;
export type Scenario = typeof scenarios.$inferSelect;
export type TestCaseAuditLog = typeof testCaseAuditLog.$inferSelect;
export type TestRun = typeof testRuns.$inferSelect;
export type TestRunResult = typeof testRunResults.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
