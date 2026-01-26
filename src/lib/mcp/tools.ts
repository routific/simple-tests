import { eq, and, inArray, isNull } from "drizzle-orm";
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

export function registerTools(auth: AuthContext): Tool[] {
  const tools: Tool[] = [];

  // Read-only tools available to all authenticated users
  // (Resources handle read operations)

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
        description: "Create a new test case with a scenario",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Title of the test case" },
            gherkin: { type: "string", description: "Gherkin content for the scenario" },
            folderId: { type: "number", description: "Folder ID (optional)" },
            state: {
              type: "string",
              enum: ["active", "draft", "retired", "rejected"],
              description: "State of the test case",
            },
            priority: {
              type: "string",
              enum: ["normal", "high", "critical"],
              description: "Priority of the test case",
            },
            scenarioTitle: { type: "string", description: "Title for the scenario (defaults to test case title)" },
          },
          required: ["title", "gherkin"],
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
            state: { type: "string", enum: ["active", "draft", "retired", "rejected"] },
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
  auth: AuthContext
): Promise<CallToolResult> {
  if (!hasPermission(auth, "write")) {
    return {
      content: [{ type: "text", text: "Permission denied: write access required" }],
      isError: true,
    };
  }

  switch (name) {
    case "create_folder":
      return createFolder(args, auth);
    case "create_test_case":
      return createTestCase(args, auth);
    case "update_test_case":
      return updateTestCase(args, auth);
    case "create_test_run":
      return createTestRun(args, auth);
    case "update_test_result":
      return updateTestResult(args, auth);
    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}

// Tool implementations

async function createFolder(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { name, parentId } = args as { name: string; parentId?: number };

  if (!name) {
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

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, folder: result[0] }, null, 2) }],
  };
}

async function createTestCase(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { title, gherkin, folderId, state, priority, scenarioTitle } = args as {
    title: string;
    gherkin: string;
    folderId?: number;
    state?: "active" | "draft" | "retired" | "rejected";
    priority?: "normal" | "high" | "critical";
    scenarioTitle?: string;
  };

  if (!title || !gherkin) {
    return {
      content: [{ type: "text", text: "Error: title and gherkin are required" }],
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

  // Create scenario
  const scenarioResult = await db
    .insert(scenarios)
    .values({
      testCaseId: testCase.id,
      title: scenarioTitle || title,
      gherkin,
      order: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const scenario = scenarioResult[0];

  // Create audit log
  await db.insert(testCaseAuditLog).values({
    testCaseId: testCase.id,
    userId: auth.userId,
    action: "created",
    changes: JSON.stringify(["title", "state", "priority", "folderId", "scenario"]),
    newValues: JSON.stringify({
      title,
      state: testCase.state,
      priority: testCase.priority,
      folderId: testCase.folderId,
      scenario: { title: scenario.title, gherkin },
    }),
    createdAt: now,
  });

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, testCase, scenario }, null, 2) }],
  };
}

async function updateTestCase(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { id, title, folderId, state, priority } = args as {
    id: number;
    title?: string;
    folderId?: number;
    state?: "active" | "draft" | "retired" | "rejected";
    priority?: "normal" | "high" | "critical";
  };

  if (!id) {
    return {
      content: [{ type: "text", text: "Error: id is required" }],
      isError: true,
    };
  }

  // Verify test case exists and belongs to org
  const existing = await db
    .select()
    .from(testCases)
    .where(
      and(
        eq(testCases.id, id),
        eq(testCases.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
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

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, testCase: result[0] }, null, 2) }],
  };
}

async function createTestRun(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { name, scenarioIds } = args as {
    name: string;
    scenarioIds: number[];
  };

  if (!name || !scenarioIds || !Array.isArray(scenarioIds) || scenarioIds.length === 0) {
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
  auth: AuthContext
): Promise<CallToolResult> {
  const { resultId, status, notes } = args as {
    resultId: number;
    status: "pending" | "passed" | "failed" | "blocked" | "skipped";
    notes?: string;
  };

  if (!resultId || !status) {
    return {
      content: [{ type: "text", text: "Error: resultId and status are required" }],
      isError: true,
    };
  }

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

  return {
    content: [{ type: "text", text: JSON.stringify({ success: true, result: result[0] }, null, 2) }],
  };
}
