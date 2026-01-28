import { eq, and, inArray, like, or, isNull, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  folders,
  testCases,
  scenarios,
  testCaseAuditLog,
  testRuns,
  testRunResults,
} from "@/lib/db/schema";
import type { AuthContext } from "./auth";
import { hasPermission } from "./auth";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { logMcpWriteOperation, getEntityState, type EntityType } from "./audit-log";

// Context for audit logging
export interface McpCallContext {
  auth: AuthContext;
  clientId: string;
  sessionId?: string;
}

export function registerTools(auth: AuthContext): Tool[] {
  const tools: Tool[] = [];

  // Read-only tools available to all authenticated users
  tools.push(
    // Folder read tools
    {
      name: "list_folders",
      description: "List all folders in the organization",
      inputSchema: {
        type: "object",
        properties: {
          parentId: { type: "number", description: "Filter by parent folder ID (null for root folders)" },
        },
      },
    },
    {
      name: "get_folder",
      description: "Get a specific folder with its test cases",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Folder ID" },
        },
        required: ["id"],
      },
    },
    // Test case read tools
    {
      name: "list_test_cases",
      description: "List test cases with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          folderId: { type: "number", description: "Filter by folder ID" },
          state: {
            type: "string",
            enum: ["active", "draft", "upcoming", "retired", "rejected"],
            description: "Filter by state",
          },
          priority: {
            type: "string",
            enum: ["normal", "high", "critical"],
            description: "Filter by priority",
          },
          limit: { type: "number", description: "Maximum number of results (default: 50)" },
          offset: { type: "number", description: "Offset for pagination (default: 0)" },
        },
      },
    },
    {
      name: "get_test_case",
      description: "Get a specific test case with all its scenarios",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Test case ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "search_test_cases",
      description: "Search test cases by title or scenario content",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (searches title and gherkin content)" },
          state: {
            type: "string",
            enum: ["active", "draft", "upcoming", "retired", "rejected"],
            description: "Filter by state",
          },
          limit: { type: "number", description: "Maximum number of results (default: 20)" },
        },
        required: ["query"],
      },
    },
    // Test run read tools
    {
      name: "list_test_runs",
      description: "List test runs in the organization",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["in_progress", "completed"],
            description: "Filter by status",
          },
          limit: { type: "number", description: "Maximum number of results (default: 20)" },
        },
      },
    },
    {
      name: "get_test_run",
      description: "Get a specific test run with all its results",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Test run ID" },
        },
        required: ["id"],
      },
    }
  );

  // Write tools require write permission
  if (hasPermission(auth, "write")) {
    tools.push(
      // Folder tools
      {
        name: "create_folder",
        description: "Create a new folder for organizing test cases",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the folder" },
            parentId: { type: "number", description: "Parent folder ID (optional)" },
          },
          required: ["name"],
        },
      },
      // Test case tools
      {
        name: "create_test_case",
        description: "Create a new test case with one or more scenarios. Use 'scenarios' array for multiple scenarios, or 'gherkin'/'scenarioTitle' for a single scenario.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Title of the test case" },
            gherkin: { type: "string", description: "Gherkin content for a single scenario (use 'scenarios' array for multiple)" },
            folderId: { type: "number", description: "Folder ID (optional)" },
            state: {
              type: "string",
              enum: ["active", "draft", "upcoming", "retired", "rejected"],
              description: "State of the test case",
            },
            priority: {
              type: "string",
              enum: ["normal", "high", "critical"],
              description: "Priority of the test case",
            },
            scenarioTitle: { type: "string", description: "Title for single scenario (defaults to test case title)" },
            scenarios: {
              type: "array",
              description: "Array of scenarios (use this for multiple scenarios)",
              items: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Scenario title" },
                  gherkin: { type: "string", description: "Gherkin content" },
                },
                required: ["title", "gherkin"],
              },
            },
          },
          required: ["title"],
        },
      },
      {
        name: "add_scenario",
        description: "Add a new scenario to an existing test case",
        inputSchema: {
          type: "object",
          properties: {
            testCaseId: { type: "number", description: "Test case ID to add scenario to" },
            title: { type: "string", description: "Scenario title" },
            gherkin: { type: "string", description: "Gherkin content" },
          },
          required: ["testCaseId", "title", "gherkin"],
        },
      },
      {
        name: "update_test_case",
        description: "Update an existing test case",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "number", description: "Test case ID" },
            title: { type: "string", description: "New title" },
            folderId: { type: "number", description: "New folder ID" },
            state: { type: "string", enum: ["active", "draft", "upcoming", "retired", "rejected"] },
            priority: { type: "string", enum: ["normal", "high", "critical"] },
          },
          required: ["id"],
        },
      },
      // Test run tools
      {
        name: "create_test_run",
        description: "Create a new test run with selected scenarios",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name of the test run" },
            scenarioIds: {
              type: "array",
              items: { type: "number" },
              description: "Array of scenario IDs to include",
            },
          },
          required: ["name", "scenarioIds"],
        },
      },
      {
        name: "update_test_result",
        description: "Update the result status of a scenario in a test run",
        inputSchema: {
          type: "object",
          properties: {
            resultId: { type: "number", description: "Test run result ID" },
            status: {
              type: "string",
              enum: ["pending", "passed", "failed", "blocked", "skipped"],
            },
            notes: { type: "string", description: "Notes about the execution" },
          },
          required: ["resultId", "status"],
        },
      }
    );
  }

  return tools;
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  auth: AuthContext,
  context?: { clientId?: string; sessionId?: string }
): Promise<CallToolResult> {
  // Read tools - available to all authenticated users
  switch (name) {
    case "list_folders":
      return listFolders(args, auth);
    case "get_folder":
      return getFolder(args, auth);
    case "list_test_cases":
      return listTestCases(args, auth);
    case "get_test_case":
      return getTestCase(args, auth);
    case "search_test_cases":
      return searchTestCases(args, auth);
    case "list_test_runs":
      return listTestRuns(args, auth);
    case "get_test_run":
      return getTestRun(args, auth);
  }

  // Write tools require write permission
  if (!hasPermission(auth, "write")) {
    return {
      content: [{ type: "text", text: "Permission denied: write access required" }],
      isError: true,
    };
  }

  // Create audit context for write operations
  const auditCtx: McpCallContext = {
    auth,
    clientId: context?.clientId || "unknown",
    sessionId: context?.sessionId,
  };

  switch (name) {
    case "create_folder":
      return createFolder(args, auth, auditCtx);
    case "create_test_case":
      return createTestCase(args, auth, auditCtx);
    case "add_scenario":
      return addScenario(args, auth, auditCtx);
    case "update_test_case":
      return updateTestCase(args, auth, auditCtx);
    case "create_test_run":
      return createTestRun(args, auth, auditCtx);
    case "update_test_result":
      return updateTestResult(args, auth, auditCtx);
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}

// Tool implementations - Read operations

async function listFolders(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  try {
    const { parentId } = args as { parentId?: number | null };

    const conditions = [eq(folders.organizationId, auth.organizationId)];

    // Handle parentId filter - null means root folders, undefined means all folders
    if (parentId === null) {
      conditions.push(isNull(folders.parentId));
    } else if (parentId !== undefined) {
      conditions.push(eq(folders.parentId, parentId));
    }

    const result = await db
      .select()
      .from(folders)
      .where(and(...conditions))
      .orderBy(folders.order, folders.name);

    return {
      content: [{ type: "text", text: JSON.stringify({ folders: result }, null, 2) }],
    };
  } catch (error) {
    console.error("[MCP Tools] listFolders error:", error);
    return {
      content: [{ type: "text", text: `Error listing folders: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function getFolder(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  try {
    const { id } = args as { id: number };

    if (!id) {
      return {
        content: [{ type: "text", text: "Error: id is required" }],
        isError: true,
      };
    }

    const folder = await db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.id, id),
          eq(folders.organizationId, auth.organizationId)
        )
      )
      .limit(1);

    if (folder.length === 0) {
      return {
        content: [{ type: "text", text: `Error: Folder not found: ${id}` }],
        isError: true,
      };
    }

    // Get test cases in this folder
    const folderTestCases = await db
      .select()
      .from(testCases)
      .where(
        and(
          eq(testCases.folderId, id),
          eq(testCases.organizationId, auth.organizationId)
        )
      )
      .orderBy(testCases.order, testCases.title);

    // Get child folders
    const childFolders = await db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.parentId, id),
          eq(folders.organizationId, auth.organizationId)
        )
      )
      .orderBy(folders.order, folders.name);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              folder: folder[0],
              testCases: folderTestCases,
              childFolders,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    console.error("[MCP Tools] getFolder error:", error);
    return {
      content: [{ type: "text", text: `Error getting folder: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function listTestCases(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  try {
    const { folderId, state, priority, limit = 50, offset = 0 } = args as {
      folderId?: number;
      state?: "active" | "draft" | "retired" | "rejected";
      priority?: "normal" | "high" | "critical";
      limit?: number;
      offset?: number;
    };

    const conditions = [eq(testCases.organizationId, auth.organizationId)];

    if (folderId !== undefined) {
      conditions.push(eq(testCases.folderId, folderId));
    }
    if (state) {
      conditions.push(eq(testCases.state, state));
    }
    if (priority) {
      conditions.push(eq(testCases.priority, priority));
    }

    const result = await db
      .select()
      .from(testCases)
      .where(and(...conditions))
      .orderBy(testCases.order, testCases.title)
      .limit(Math.min(limit, 100))
      .offset(offset);

    // Get total count for pagination info
    const allMatching = await db
      .select({ id: testCases.id })
      .from(testCases)
      .where(and(...conditions));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              testCases: result,
              pagination: {
                total: allMatching.length,
                limit: Math.min(limit, 100),
                offset,
                hasMore: offset + result.length < allMatching.length,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    console.error("[MCP Tools] listTestCases error:", error);
    return {
      content: [{ type: "text", text: `Error listing test cases: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function getTestCase(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  try {
    const { id } = args as { id: number };

    if (!id) {
      return {
        content: [{ type: "text", text: "Error: id is required" }],
        isError: true,
      };
    }

    const testCase = await db
      .select()
      .from(testCases)
      .where(
        and(
          eq(testCases.id, id),
          eq(testCases.organizationId, auth.organizationId)
        )
      )
      .limit(1);

    if (testCase.length === 0) {
      return {
        content: [{ type: "text", text: `Error: Test case not found: ${id}` }],
        isError: true,
      };
    }

    // Get all scenarios for this test case
    const testCaseScenarios = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.testCaseId, id))
      .orderBy(scenarios.order);

    // Get folder info if in a folder
    let folder = null;
    if (testCase[0].folderId) {
      const folderResult = await db
        .select()
        .from(folders)
        .where(eq(folders.id, testCase[0].folderId))
        .limit(1);
      if (folderResult.length > 0) {
        folder = folderResult[0];
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              testCase: testCase[0],
              scenarios: testCaseScenarios,
              folder,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    console.error("[MCP Tools] getTestCase error:", error);
    return {
      content: [{ type: "text", text: `Error getting test case: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function searchTestCases(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  try {
    const { query, state, limit = 20 } = args as {
      query: string;
      state?: "active" | "draft" | "retired" | "rejected";
      limit?: number;
    };

    if (!query) {
      return {
        content: [{ type: "text", text: "Error: query is required" }],
        isError: true,
      };
    }

    const searchPattern = `%${query}%`;

    // Search in test case titles
    const titleConditions = [
      eq(testCases.organizationId, auth.organizationId),
      like(testCases.title, searchPattern),
    ];
    if (state) {
      titleConditions.push(eq(testCases.state, state));
    }

    const titleMatches = await db
      .select()
      .from(testCases)
      .where(and(...titleConditions))
      .limit(Math.min(limit, 50));

    // Search in scenario gherkin content
    const scenarioMatches = await db
      .select({
        testCase: testCases,
        scenario: scenarios,
      })
      .from(scenarios)
      .innerJoin(testCases, eq(scenarios.testCaseId, testCases.id))
      .where(
        and(
          eq(testCases.organizationId, auth.organizationId),
          or(
            like(scenarios.title, searchPattern),
            like(scenarios.gherkin, searchPattern)
          ),
          ...(state ? [eq(testCases.state, state)] : [])
        )
      )
      .limit(Math.min(limit, 50));

    // Combine and deduplicate results
    const seenIds = new Set<number>();
    const results: Array<{
      testCase: typeof testCases.$inferSelect;
      matchedIn: string[];
      scenarioMatch?: typeof scenarios.$inferSelect;
    }> = [];

    for (const tc of titleMatches) {
      if (!seenIds.has(tc.id)) {
        seenIds.add(tc.id);
        results.push({ testCase: tc, matchedIn: ["title"] });
      }
    }

    for (const match of scenarioMatches) {
      if (!seenIds.has(match.testCase.id)) {
        seenIds.add(match.testCase.id);
        results.push({
          testCase: match.testCase,
          matchedIn: ["scenario"],
          scenarioMatch: match.scenario,
        });
      } else {
        const existing = results.find((r) => r.testCase.id === match.testCase.id);
        if (existing && !existing.matchedIn.includes("scenario")) {
          existing.matchedIn.push("scenario");
        }
      }
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              query,
              results: results.slice(0, Math.min(limit, 50)),
              total: results.length,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    console.error("[MCP Tools] searchTestCases error:", error);
    return {
      content: [{ type: "text", text: `Error searching test cases: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function listTestRuns(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  try {
    const { status, limit = 20 } = args as {
      status?: "in_progress" | "completed";
      limit?: number;
    };

    const conditions = [eq(testRuns.organizationId, auth.organizationId)];

    if (status) {
      conditions.push(eq(testRuns.status, status));
    }

    const result = await db
      .select()
      .from(testRuns)
      .where(and(...conditions))
      .orderBy(testRuns.createdAt)
      .limit(Math.min(limit, 50));

    // Get result summaries for each test run
    const runsWithSummaries = await Promise.all(
      result.map(async (run) => {
        const results = await db
          .select({ status: testRunResults.status })
          .from(testRunResults)
          .where(eq(testRunResults.testRunId, run.id));

        const summary = {
          total: results.length,
          passed: results.filter((r) => r.status === "passed").length,
          failed: results.filter((r) => r.status === "failed").length,
          pending: results.filter((r) => r.status === "pending").length,
          blocked: results.filter((r) => r.status === "blocked").length,
          skipped: results.filter((r) => r.status === "skipped").length,
        };

        return { ...run, summary };
      })
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ testRuns: runsWithSummaries }, null, 2),
        },
      ],
    };
  } catch (error) {
    console.error("[MCP Tools] listTestRuns error:", error);
    return {
      content: [{ type: "text", text: `Error listing test runs: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

async function getTestRun(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  try {
    const { id } = args as { id: number };

    if (!id) {
      return {
        content: [{ type: "text", text: "Error: id is required" }],
        isError: true,
      };
    }

    const testRun = await db
      .select()
      .from(testRuns)
      .where(
        and(
          eq(testRuns.id, id),
          eq(testRuns.organizationId, auth.organizationId)
        )
      )
      .limit(1);

    if (testRun.length === 0) {
      return {
        content: [{ type: "text", text: `Error: Test run not found: ${id}` }],
        isError: true,
      };
    }

    // Get all results with scenario and test case info
    const results = await db
      .select({
        result: testRunResults,
        scenario: scenarios,
        testCase: testCases,
      })
      .from(testRunResults)
      .innerJoin(scenarios, eq(testRunResults.scenarioId, scenarios.id))
      .innerJoin(testCases, eq(scenarios.testCaseId, testCases.id))
      .where(eq(testRunResults.testRunId, id));

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.result.status === "passed").length,
      failed: results.filter((r) => r.result.status === "failed").length,
      pending: results.filter((r) => r.result.status === "pending").length,
      blocked: results.filter((r) => r.result.status === "blocked").length,
      skipped: results.filter((r) => r.result.status === "skipped").length,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              testRun: testRun[0],
              results,
              summary,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    console.error("[MCP Tools] getTestRun error:", error);
    return {
      content: [{ type: "text", text: `Error getting test run: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}

// Tool implementations - Write operations

async function createFolder(
  args: Record<string, unknown>,
  auth: AuthContext,
  ctx: McpCallContext
): Promise<CallToolResult> {
  const { name, parentId } = args as { name: string; parentId?: number };

  if (!name) {
    await logMcpWriteOperation(ctx, {
      toolName: "create_folder",
      toolArgs: args,
      entityType: "folder",
      status: "failed",
      errorMessage: "name is required",
    });
    return {
      content: [{ type: "text", text: "Error: name is required" }],
      isError: true,
    };
  }

  // Verify parent folder if specified
  if (parentId !== undefined && parentId !== null) {
    const parent = await db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.id, parentId),
          eq(folders.organizationId, auth.organizationId)
        )
      )
      .limit(1);

    if (parent.length === 0) {
      await logMcpWriteOperation(ctx, {
        toolName: "create_folder",
        toolArgs: args,
        entityType: "folder",
        status: "failed",
        errorMessage: `Parent folder not found: ${parentId}`,
      });
      return {
        content: [{ type: "text", text: `Error: Parent folder not found: ${parentId}` }],
        isError: true,
      };
    }
  }

  const result = await db
    .insert(folders)
    .values({
      name,
      parentId: parentId ?? null,
      organizationId: auth.organizationId,
    })
    .returning();

  const folder = result[0];

  // Log successful create
  await logMcpWriteOperation(ctx, {
    toolName: "create_folder",
    toolArgs: args,
    entityType: "folder",
    entityId: folder.id,
    afterState: folder,
    status: "success",
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, folder }, null, 2) }],
  };
}

async function createTestCase(
  args: Record<string, unknown>,
  auth: AuthContext,
  ctx: McpCallContext
): Promise<CallToolResult> {
  const { title, gherkin, folderId, state, priority, scenarioTitle, scenarios: scenariosInput } = args as {
    title: string;
    gherkin?: string;
    folderId?: number;
    state?: "active" | "draft" | "retired" | "rejected";
    priority?: "normal" | "high" | "critical";
    scenarioTitle?: string;
    scenarios?: Array<{ title: string; gherkin: string }>;
  };

  // Build scenarios array from either format
  let scenariosToCreate: Array<{ title: string; gherkin: string }> = [];

  if (scenariosInput && Array.isArray(scenariosInput) && scenariosInput.length > 0) {
    // Use scenarios array
    scenariosToCreate = scenariosInput;
  } else if (gherkin) {
    // Use single scenario format
    scenariosToCreate = [{ title: scenarioTitle || title, gherkin }];
  }

  if (!title || scenariosToCreate.length === 0) {
    await logMcpWriteOperation(ctx, {
      toolName: "create_test_case",
      toolArgs: args,
      entityType: "test_case",
      status: "failed",
      errorMessage: "title is required, and either 'gherkin' or 'scenarios' array must be provided",
    });
    return {
      content: [{ type: "text", text: "Error: title is required, and either 'gherkin' or 'scenarios' array must be provided" }],
      isError: true,
    };
  }

  // Verify folder if specified
  if (folderId !== undefined && folderId !== null) {
    const folder = await db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.id, folderId),
          eq(folders.organizationId, auth.organizationId)
        )
      )
      .limit(1);

    if (folder.length === 0) {
      await logMcpWriteOperation(ctx, {
        toolName: "create_test_case",
        toolArgs: args,
        entityType: "test_case",
        status: "failed",
        errorMessage: `Folder not found: ${folderId}`,
      });
      return {
        content: [{ type: "text", text: `Error: Folder not found: ${folderId}` }],
        isError: true,
      };
    }
  }

  const now = new Date();

  // Create test case
  const testCaseResult = await db
    .insert(testCases)
    .values({
      title,
      folderId: folderId ?? null,
      state: state ?? "active",
      priority: priority ?? "normal",
      organizationId: auth.organizationId,
      createdBy: auth.userId,
      updatedBy: auth.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const testCase = testCaseResult[0];

  // Create scenarios
  const createdScenarios = [];
  for (let i = 0; i < scenariosToCreate.length; i++) {
    const s = scenariosToCreate[i];
    const scenarioResult = await db
      .insert(scenarios)
      .values({
        testCaseId: testCase.id,
        title: s.title,
        gherkin: s.gherkin,
        order: i,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    createdScenarios.push(scenarioResult[0]);
  }

  // Create audit log (existing)
  await db.insert(testCaseAuditLog).values({
    testCaseId: testCase.id,
    userId: auth.userId,
    action: "created",
    changes: JSON.stringify(["title", "state", "priority", "folderId", "scenarios"]),
    newValues: JSON.stringify({
      title,
      state: testCase.state,
      priority: testCase.priority,
      folderId: testCase.folderId,
      scenarios: createdScenarios.map((s) => ({ title: s.title, gherkin: s.gherkin })),
    }),
    createdAt: now,
  });

  // Log to MCP write log
  await logMcpWriteOperation(ctx, {
    toolName: "create_test_case",
    toolArgs: args,
    entityType: "test_case",
    entityId: testCase.id,
    afterState: { ...testCase, scenarios: createdScenarios },
    status: "success",
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, testCase, scenarios: createdScenarios }, null, 2) }],
  };
}

async function addScenario(
  args: Record<string, unknown>,
  auth: AuthContext,
  ctx: McpCallContext
): Promise<CallToolResult> {
  const { testCaseId, title, gherkin } = args as {
    testCaseId: number;
    title: string;
    gherkin: string;
  };

  if (!testCaseId || !title || !gherkin) {
    await logMcpWriteOperation(ctx, {
      toolName: "add_scenario",
      toolArgs: args,
      entityType: "scenario",
      status: "failed",
      errorMessage: "testCaseId, title, and gherkin are required",
    });
    return {
      content: [{ type: "text", text: "Error: testCaseId, title, and gherkin are required" }],
      isError: true,
    };
  }

  // Verify test case exists and belongs to org
  const testCase = await db
    .select()
    .from(testCases)
    .where(
      and(
        eq(testCases.id, testCaseId),
        eq(testCases.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (testCase.length === 0) {
    await logMcpWriteOperation(ctx, {
      toolName: "add_scenario",
      toolArgs: args,
      entityType: "scenario",
      status: "failed",
      errorMessage: `Test case not found: ${testCaseId}`,
    });
    return {
      content: [{ type: "text", text: `Error: Test case not found: ${testCaseId}` }],
      isError: true,
    };
  }

  // Get max order for existing scenarios
  const existingScenarios = await db
    .select({ order: scenarios.order })
    .from(scenarios)
    .where(eq(scenarios.testCaseId, testCaseId))
    .orderBy(desc(scenarios.order))
    .limit(1);

  const nextOrder = existingScenarios.length > 0 ? existingScenarios[0].order + 1 : 0;
  const now = new Date();

  // Create scenario
  const scenarioResult = await db
    .insert(scenarios)
    .values({
      testCaseId,
      title,
      gherkin,
      order: nextOrder,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const scenario = scenarioResult[0];

  // Update test case updatedAt
  await db
    .update(testCases)
    .set({ updatedAt: now, updatedBy: auth.userId })
    .where(eq(testCases.id, testCaseId));

  // Log to MCP write log
  await logMcpWriteOperation(ctx, {
    toolName: "add_scenario",
    toolArgs: args,
    entityType: "scenario",
    entityId: scenario.id,
    afterState: scenario,
    status: "success",
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, scenario }, null, 2) }],
  };
}

async function updateTestCase(
  args: Record<string, unknown>,
  auth: AuthContext,
  ctx: McpCallContext
): Promise<CallToolResult> {
  const { id, title, folderId, state, priority } = args as {
    id: number;
    title?: string;
    folderId?: number;
    state?: "active" | "draft" | "retired" | "rejected";
    priority?: "normal" | "high" | "critical";
  };

  if (!id) {
    await logMcpWriteOperation(ctx, {
      toolName: "update_test_case",
      toolArgs: args,
      entityType: "test_case",
      status: "failed",
      errorMessage: "id is required",
    });
    return {
      content: [{ type: "text", text: "Error: id is required" }],
      isError: true,
    };
  }

  // Get before state for undo capability
  const beforeState = await getEntityState("test_case", id, auth.organizationId);

  if (!beforeState) {
    await logMcpWriteOperation(ctx, {
      toolName: "update_test_case",
      toolArgs: args,
      entityType: "test_case",
      entityId: id,
      status: "failed",
      errorMessage: `Test case not found: ${id}`,
    });
    return {
      content: [{ type: "text", text: `Error: Test case not found: ${id}` }],
      isError: true,
    };
  }

  const updates: Partial<typeof testCases.$inferInsert> = {
    updatedAt: new Date(),
    updatedBy: auth.userId,
  };

  if (title !== undefined) updates.title = title;
  if (folderId !== undefined) updates.folderId = folderId;
  if (state !== undefined) updates.state = state;
  if (priority !== undefined) updates.priority = priority;

  const result = await db
    .update(testCases)
    .set(updates)
    .where(eq(testCases.id, id))
    .returning();

  const afterState = await getEntityState("test_case", id, auth.organizationId);

  // Log to MCP write log
  await logMcpWriteOperation(ctx, {
    toolName: "update_test_case",
    toolArgs: args,
    entityType: "test_case",
    entityId: id,
    beforeState,
    afterState,
    status: "success",
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, testCase: result[0] }, null, 2) }],
  };
}

async function createTestRun(
  args: Record<string, unknown>,
  auth: AuthContext,
  ctx: McpCallContext
): Promise<CallToolResult> {
  const { name, scenarioIds } = args as {
    name: string;
    scenarioIds: number[];
  };

  if (!name || !scenarioIds || !Array.isArray(scenarioIds) || scenarioIds.length === 0) {
    await logMcpWriteOperation(ctx, {
      toolName: "create_test_run",
      toolArgs: args,
      entityType: "test_run",
      status: "failed",
      errorMessage: "name and non-empty scenarioIds array are required",
    });
    return {
      content: [{ type: "text", text: "Error: name and non-empty scenarioIds array are required" }],
      isError: true,
    };
  }

  // Verify scenarios exist and belong to org
  const existingScenarios = await db
    .select({ scenario: scenarios, testCase: testCases })
    .from(scenarios)
    .innerJoin(testCases, eq(scenarios.testCaseId, testCases.id))
    .where(
      and(
        inArray(scenarios.id, scenarioIds),
        eq(testCases.organizationId, auth.organizationId)
      )
    );

  const existingIds = new Set(existingScenarios.map((s) => s.scenario.id));
  const missingIds = scenarioIds.filter((id) => !existingIds.has(id));

  if (missingIds.length > 0) {
    await logMcpWriteOperation(ctx, {
      toolName: "create_test_run",
      toolArgs: args,
      entityType: "test_run",
      status: "failed",
      errorMessage: `Scenarios not found: ${missingIds.join(", ")}`,
    });
    return {
      content: [{ type: "text", text: `Error: Scenarios not found: ${missingIds.join(", ")}` }],
      isError: true,
    };
  }

  const now = new Date();

  // Create test run
  const runResult = await db
    .insert(testRuns)
    .values({
      name,
      organizationId: auth.organizationId,
      createdBy: auth.userId,
      createdAt: now,
      status: "in_progress",
    })
    .returning();

  const testRun = runResult[0];

  // Create result entries
  const resultEntries = scenarioIds.map((scenarioId) => ({
    testRunId: testRun.id,
    scenarioId,
    status: "pending" as const,
  }));

  await db.insert(testRunResults).values(resultEntries);

  const results = await db
    .select()
    .from(testRunResults)
    .where(eq(testRunResults.testRunId, testRun.id));

  // Log to MCP write log
  await logMcpWriteOperation(ctx, {
    toolName: "create_test_run",
    toolArgs: args,
    entityType: "test_run",
    entityId: testRun.id,
    afterState: { ...testRun, results },
    status: "success",
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            testRun,
            results,
            summary: { total: results.length, pending: results.length },
          },
          null,
          2
        ),
      },
    ],
  };
}

async function updateTestResult(
  args: Record<string, unknown>,
  auth: AuthContext,
  ctx: McpCallContext
): Promise<CallToolResult> {
  const { resultId, status, notes } = args as {
    resultId: number;
    status: "pending" | "passed" | "failed" | "blocked" | "skipped";
    notes?: string;
  };

  if (!resultId || !status) {
    await logMcpWriteOperation(ctx, {
      toolName: "update_test_result",
      toolArgs: args,
      entityType: "test_result",
      status: "failed",
      errorMessage: "resultId and status are required",
    });
    return {
      content: [{ type: "text", text: "Error: resultId and status are required" }],
      isError: true,
    };
  }

  // Get before state for undo capability
  const beforeState = await getEntityState("test_result", resultId, auth.organizationId);

  // Verify result exists and belongs to org
  const existing = await db
    .select({ result: testRunResults, testRun: testRuns })
    .from(testRunResults)
    .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
    .where(
      and(
        eq(testRunResults.id, resultId),
        eq(testRuns.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    await logMcpWriteOperation(ctx, {
      toolName: "update_test_result",
      toolArgs: args,
      entityType: "test_result",
      entityId: resultId,
      status: "failed",
      errorMessage: `Test result not found: ${resultId}`,
    });
    return {
      content: [{ type: "text", text: `Error: Test result not found: ${resultId}` }],
      isError: true,
    };
  }

  const updates: Partial<typeof testRunResults.$inferInsert> = {
    status,
    executedAt: new Date(),
    executedBy: auth.userId,
  };

  if (notes !== undefined) {
    updates.notes = notes;
  }

  const result = await db
    .update(testRunResults)
    .set(updates)
    .where(eq(testRunResults.id, resultId))
    .returning();

  const afterState = await getEntityState("test_result", resultId, auth.organizationId);

  // Log to MCP write log
  await logMcpWriteOperation(ctx, {
    toolName: "update_test_result",
    toolArgs: args,
    entityType: "test_result",
    entityId: resultId,
    beforeState,
    afterState,
    status: "success",
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, result: result[0] }, null, 2) }],
  };
}
