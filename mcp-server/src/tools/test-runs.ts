import { eq, and, inArray } from "drizzle-orm";
import { db, testRuns, testRunResults, scenarios, testCases } from "../shared/index.js";
import { AuthContext, hasPermission } from "../auth/index.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function registerTestRunTools(auth: AuthContext): Tool[] {
  const tools: Tool[] = [];

  if (hasPermission(auth, "write")) {
    tools.push(
      {
        name: "create_test_run",
        description: "Create a new test run with selected scenarios",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the test run",
            },
            description: {
              type: "string",
              description: "Description of the test run",
            },
            scenarioIds: {
              type: "array",
              items: { type: "number" },
              description: "Array of scenario IDs to include in the run",
            },
          },
          required: ["name", "scenarioIds"],
        },
      },
      {
        name: "update_test_result",
        description: "Update the result status of a test case in a test run",
        inputSchema: {
          type: "object",
          properties: {
            resultId: {
              type: "number",
              description: "ID of the test run result to update",
            },
            status: {
              type: "string",
              enum: ["pending", "passed", "failed", "blocked", "skipped"],
              description: "New status for the test result",
            },
            notes: {
              type: "string",
              description: "Optional notes about the test execution",
            },
          },
          required: ["resultId", "status"],
        },
      }
    );
  }

  return tools;
}

export async function handleTestRunTool(
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
    case "create_test_run":
      return createTestRun(args, auth);
    case "update_test_result":
      return updateTestResult(args, auth);
    default:
      return {
        content: [{ type: "text", text: `Unknown test run tool: ${name}` }],
        isError: true,
      };
  }
}

async function createTestRun(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  try {
    const { name, description, scenarioIds } = args as {
      name: string;
      description?: string;
      scenarioIds: number[];
    };

    console.error(`[MCP] createTestRun called with: name="${name}", scenarioIds=${JSON.stringify(scenarioIds)}`);

    if (!name || !scenarioIds || !Array.isArray(scenarioIds) || scenarioIds.length === 0) {
      return {
        content: [{ type: "text", text: "Error: name and non-empty scenarioIds array are required" }],
        isError: true,
      };
    }

    // Verify all scenarios exist and belong to org (via test case)
    const existingScenarios = await db
      .select({
        scenario: scenarios,
        testCase: testCases,
      })
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

    // Create the test run
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
    console.error(`[MCP] Test run created with id: ${testRun.id}`);

    // Create result entries for each scenario
    const resultEntries = scenarioIds.map((scenarioId) => ({
      testRunId: testRun.id,
      scenarioId,
      status: "pending" as const,
    }));

    await db.insert(testRunResults).values(resultEntries);

    // Fetch the created results
    const results = await db
      .select()
      .from(testRunResults)
      .where(eq(testRunResults.testRunId, testRun.id));

    console.error(`[MCP] createTestRun completed successfully`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              testRun,
              results,
              summary: {
                total: results.length,
                pending: results.length,
              },
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[MCP] createTestRun error:`, errorMessage);
    return {
      content: [{ type: "text", text: `Error creating test run: ${errorMessage}` }],
      isError: true,
    };
  }
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

  // Verify result exists and belongs to org (via test run)
  const existing = await db
    .select({
      result: testRunResults,
      testRun: testRuns,
    })
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
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, result: result[0] }, null, 2),
      },
    ],
  };
}
