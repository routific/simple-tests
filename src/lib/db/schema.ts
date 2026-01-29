import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Forward declaration for scenarios table (defined after testCases)

// Organizations (Linear workspaces)
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(), // Linear organization ID
  name: text("name").notNull(),
  urlKey: text("url_key"), // Linear workspace slug for deep links
  logoUrl: text("logo_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // Linear user ID
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

// Junction table for test case to Linear issue links
export const testCaseLinearIssues = sqliteTable(
  "test_case_linear_issues",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    testCaseId: integer("test_case_id")
      .notNull()
      .references(() => testCases.id, { onDelete: "cascade" }),
    linearIssueId: text("linear_issue_id").notNull(),
    linearIssueIdentifier: text("linear_issue_identifier").notNull(),
    linearIssueTitle: text("linear_issue_title").notNull(),
    linkedAt: integer("linked_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    linkedBy: text("linked_by").references(() => users.id),
  },
  (table) => [index("tcli_test_case_idx").on(table.testCaseId)]
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

// Audit log for test case changes
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
    changes: text("changes").notNull(), // JSON string with field diffs
    previousValues: text("previous_values"), // JSON string with previous field values
    newValues: text("new_values"), // JSON string with new field values
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("audit_log_test_case_idx").on(table.testCaseId)]
);

// Releases - logical groupings for test runs
export const releases = sqliteTable(
  "releases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    status: text("status", { enum: ["active", "completed"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    createdBy: text("created_by").references(() => users.id),
  },
  (table) => [index("releases_org_idx").on(table.organizationId)]
);

export const testRuns = sqliteTable(
  "test_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    releaseId: integer("release_id").references(() => releases.id),
    organizationId: text("organization_id")
      .notNull()
      .default("local-dev-org")
      .references(() => organizations.id),
    // Linear integration fields
    linearProjectId: text("linear_project_id"),
    linearProjectName: text("linear_project_name"),
    linearMilestoneId: text("linear_milestone_id"),
    linearMilestoneName: text("linear_milestone_name"),
    linearIssueId: text("linear_issue_id"),
    linearIssueIdentifier: text("linear_issue_identifier"), // e.g., "ENG-123"
    linearIssueTitle: text("linear_issue_title"),
    environment: text("environment", { enum: ["sandbox", "dev", "staging", "prod"] }),
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
    // Snapshot fields - captured when scenario is marked complete
    scenarioTitleSnapshot: text("scenario_title_snapshot"),
    scenarioGherkinSnapshot: text("scenario_gherkin_snapshot"),
    testCaseTitleSnapshot: text("test_case_title_snapshot"),
  },
  (table) => [index("test_run_results_run_idx").on(table.testRunId)]
);

// Undo stack for global undo functionality
export const undoStack = sqliteTable(
  "undo_stack",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actionType: text("action_type", {
      enum: [
        "create_test_case",
        "update_test_case",
        "delete_test_case",
        "create_scenario",
        "update_scenario",
        "delete_scenario",
        "bulk_delete_test_cases",
        "bulk_update_test_cases",
        "bulk_move_test_cases",
        "reorder_test_cases",
        "reorder_scenarios",
        "create_folder",
        "rename_folder",
        "delete_folder",
        "move_folder",
        "move_test_case_to_folder",
        "reorder_folders",
        "delete_test_run",
      ],
    }).notNull(),
    description: text("description").notNull(),
    undoData: text("undo_data").notNull(), // JSON with data needed to reverse
    isRedo: integer("is_redo", { mode: "boolean" }).notNull().default(false), // true = in redo stack
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("undo_stack_org_idx").on(table.organizationId)]
);

// API tokens for MCP server authentication
export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: text("id").primaryKey(), // Token ID (st_xxx format)
    name: text("name").notNull(), // User-friendly name for the token
    tokenHash: text("token_hash").notNull(), // SHA-256 hash of the actual token
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id), // Who created this token
    permissions: text("permissions", { enum: ["read", "write", "admin"] })
      .notNull()
      .default("read"),
    expiresAt: integer("expires_at", { mode: "timestamp" }), // Optional expiration
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }), // Track usage
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    revokedAt: integer("revoked_at", { mode: "timestamp" }), // Soft delete
  },
  (table) => [index("api_tokens_org_idx").on(table.organizationId)]
);

export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type TestCase = typeof testCases.$inferSelect;
export type TestCaseLinearIssue = typeof testCaseLinearIssues.$inferSelect;
export type Scenario = typeof scenarios.$inferSelect;
export type TestCaseAuditLog = typeof testCaseAuditLog.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type TestRun = typeof testRuns.$inferSelect;
export type TestRunResult = typeof testRunResults.$inferSelect;
export type UndoStackEntry = typeof undoStack.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;

// OAuth authorization codes for MCP OAuth flow
export const oauthAuthorizationCodes = sqliteTable(
  "oauth_authorization_codes",
  {
    code: text("code").primaryKey(),
    clientId: text("client_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    redirectUri: text("redirect_uri").notNull(),
    codeChallenge: text("code_challenge").notNull(),
    codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
    scope: text("scope"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  }
);

// OAuth access tokens for MCP
export const oauthAccessTokens = sqliteTable(
  "oauth_access_tokens",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    clientId: text("client_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    scope: text("scope"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
  },
  (table) => [index("oauth_tokens_user_idx").on(table.userId)]
);

// OAuth refresh tokens for MCP
export const oauthRefreshTokens = sqliteTable(
  "oauth_refresh_tokens",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    accessTokenId: text("access_token_id")
      .notNull()
      .references(() => oauthAccessTokens.id),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
  }
);

export type OAuthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type OAuthAccessToken = typeof oauthAccessTokens.$inferSelect;
export type OAuthRefreshToken = typeof oauthRefreshTokens.$inferSelect;

// MCP Write Log for auditing and undo capability
export const mcpWriteLog = sqliteTable(
  "mcp_write_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    clientId: text("client_id").notNull(), // OAuth client ID or "api_token"
    sessionId: text("session_id"), // MCP session ID

    // Operation details
    toolName: text("tool_name").notNull(),
    toolArgs: text("tool_args").notNull(), // JSON

    // Affected entity
    entityType: text("entity_type", {
      enum: ["folder", "test_case", "scenario", "test_run", "test_result"],
    }).notNull(),
    entityId: integer("entity_id"),

    // State snapshots for undo
    beforeState: text("before_state"), // JSON snapshot before (for update/delete)
    afterState: text("after_state"), // JSON snapshot after

    // Status
    status: text("status", { enum: ["success", "failed"] }).notNull(),
    errorMessage: text("error_message"),

    // Undo tracking
    undoneAt: integer("undone_at", { mode: "timestamp" }),
    undoneBy: text("undone_by").references(() => users.id),

    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("mcp_write_log_org_idx").on(table.organizationId),
    index("mcp_write_log_user_idx").on(table.userId),
    index("mcp_write_log_created_idx").on(table.createdAt),
  ]
);

export type McpWriteLog = typeof mcpWriteLog.$inferSelect;
