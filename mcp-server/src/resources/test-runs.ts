import { eq, and, desc } from "drizzle-orm";
import { db, testRuns, testRunResults, testCases, scenarios, users } from "../shared/index.js";
import { AuthContext } from "../auth/index.js";
import type { Resource } from "@modelcontextprotocol/sdk/types.js";

export function registerTestRunResources(): Resource[] {
  return [
    {
      uri: "test-runs://list",
      name: "Test Runs List",
      description: "List all test runs",
      mimeType: "application/json",
    },
    {
      uri: "test-runs://{id}",
      name: "Single Test Run",
      description: "Get a specific test run with results",
      mimeType: "application/json",
    },
  ];
}

export async function handleTestRunResource(
  uri: string,
  auth: AuthContext
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  if (uri === "test-runs://list") {
    return getTestRunsList(auth);
  }

  const match = uri.match(/^test-runs:\/\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    return getSingleTestRun(id, auth);
  }

  throw new Error(`Invalid test run resource URI: ${uri}`);
}

async function getTestRunsList(auth: AuthContext) {
  const runs = await db
    .select({
      id: testRuns.id,
      name: testRuns.name,
      description: testRuns.description,
      status: testRuns.status,
      linearProjectName: testRuns.linearProjectName,
      linearMilestoneName: testRuns.linearMilestoneName,
      linearIssueIdentifier: testRuns.linearIssueIdentifier,
      linearIssueTitle: testRuns.linearIssueTitle,
      createdAt: testRuns.createdAt,
      createdByName: users.name,
    })
    .from(testRuns)
    .leftJoin(users, eq(testRuns.createdBy, users.id))
    .where(eq(testRuns.organizationId, auth.organizationId))
    .orderBy(desc(testRuns.createdAt))
    .limit(50);

  return {
    contents: [
      {
        uri: "test-runs://list",
        mimeType: "application/json",
        text: JSON.stringify(runs, null, 2),
      },
    ],
  };
}

async function getSingleTestRun(id: number, auth: AuthContext) {
  const run = await db
    .select()
    .from(testRuns)
    .where(
      and(
        eq(testRuns.id, id),
        eq(testRuns.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (run.length === 0) {
    throw new Error(`Test run not found: ${id}`);
  }

  // Get results with scenario and test case info
  const results = await db
    .select({
      id: testRunResults.id,
      scenarioId: testRunResults.scenarioId,
      scenarioTitle: scenarios.title,
      testCaseId: scenarios.testCaseId,
      testCaseTitle: testCases.title,
      status: testRunResults.status,
      notes: testRunResults.notes,
      executedAt: testRunResults.executedAt,
      executedByName: users.name,
    })
    .from(testRunResults)
    .leftJoin(scenarios, eq(testRunResults.scenarioId, scenarios.id))
    .leftJoin(testCases, eq(scenarios.testCaseId, testCases.id))
    .leftJoin(users, eq(testRunResults.executedBy, users.id))
    .where(eq(testRunResults.testRunId, id));

  const result = {
    ...run[0],
    results,
    summary: {
      total: results.length,
      pending: results.filter((r) => r.status === "pending").length,
      passed: results.filter((r) => r.status === "passed").length,
      failed: results.filter((r) => r.status === "failed").length,
      blocked: results.filter((r) => r.status === "blocked").length,
      skipped: results.filter((r) => r.status === "skipped").length,
    },
  };

  return {
    contents: [
      {
        uri: `test-runs://${id}`,
        mimeType: "application/json",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
