import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  folders,
  testCases,
  scenarios,
  testRuns,
  testRunResults,
  users,
} from "@/lib/db/schema";
import type { AuthContext } from "./auth";
import type { Resource } from "@modelcontextprotocol/sdk/types.js";

export function registerResources(): Resource[] {
  return [
    // Folder resources
    {
      uri: "folders://list",
      name: "Folders List",
      description: "List all folders in a tree structure",
      mimeType: "application/json",
    },
    {
      uri: "folders://{id}",
      name: "Single Folder",
      description: "Get a specific folder with its test cases",
      mimeType: "application/json",
    },
    // Test case resources
    {
      uri: "test-cases://list",
      name: "Test Cases List",
      description: "List all test cases",
      mimeType: "application/json",
    },
    {
      uri: "test-cases://{id}",
      name: "Single Test Case",
      description: "Get a specific test case with scenarios",
      mimeType: "application/json",
    },
    // Test run resources
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

export async function handleResourceRead(
  uri: string,
  auth: AuthContext
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  // Folder resources
  if (uri === "folders://list") {
    return getFoldersList(auth);
  }
  if (uri.startsWith("folders://")) {
    const match = uri.match(/^folders:\/\/(\d+)$/);
    if (match) {
      return getSingleFolder(parseInt(match[1], 10), auth);
    }
  }

  // Test case resources
  if (uri === "test-cases://list") {
    return getTestCasesList(auth);
  }
  if (uri.startsWith("test-cases://")) {
    const match = uri.match(/^test-cases:\/\/(\d+)$/);
    if (match) {
      return getSingleTestCase(parseInt(match[1], 10), auth);
    }
  }

  // Test run resources
  if (uri === "test-runs://list") {
    return getTestRunsList(auth);
  }
  if (uri.startsWith("test-runs://")) {
    const match = uri.match(/^test-runs:\/\/(\d+)$/);
    if (match) {
      return getSingleTestRun(parseInt(match[1], 10), auth);
    }
  }

  throw new Error(`Unknown resource: ${uri}`);
}

// Folder resources

async function getFoldersList(auth: AuthContext) {
  const allFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.organizationId, auth.organizationId));

  // Build tree structure
  const folderMap = new Map(allFolders.map((f) => [f.id, { ...f, children: [] as typeof allFolders }]));
  const rootFolders: (typeof allFolders[0] & { children: typeof allFolders })[] = [];

  const folderValues = Array.from(folderMap.values());
  for (const folder of folderValues) {
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children.push(folder);
    } else {
      rootFolders.push(folder);
    }
  }

  return {
    contents: [
      {
        uri: "folders://list",
        mimeType: "application/json",
        text: JSON.stringify(rootFolders, null, 2),
      },
    ],
  };
}

async function getSingleFolder(id: number, auth: AuthContext) {
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
    throw new Error(`Folder not found: ${id}`);
  }

  const cases = await db
    .select()
    .from(testCases)
    .where(eq(testCases.folderId, id));

  return {
    contents: [
      {
        uri: `folders://${id}`,
        mimeType: "application/json",
        text: JSON.stringify({ folder: folder[0], testCases: cases }, null, 2),
      },
    ],
  };
}

// Test case resources

async function getTestCasesList(auth: AuthContext) {
  const cases = await db
    .select({
      id: testCases.id,
      title: testCases.title,
      folderId: testCases.folderId,
      state: testCases.state,
      priority: testCases.priority,
      createdAt: testCases.createdAt,
      updatedAt: testCases.updatedAt,
    })
    .from(testCases)
    .where(eq(testCases.organizationId, auth.organizationId))
    .orderBy(desc(testCases.updatedAt))
    .limit(100);

  return {
    contents: [
      {
        uri: "test-cases://list",
        mimeType: "application/json",
        text: JSON.stringify(cases, null, 2),
      },
    ],
  };
}

async function getSingleTestCase(id: number, auth: AuthContext) {
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
    throw new Error(`Test case not found: ${id}`);
  }

  const caseScenarios = await db
    .select()
    .from(scenarios)
    .where(eq(scenarios.testCaseId, id))
    .orderBy(scenarios.order);

  return {
    contents: [
      {
        uri: `test-cases://${id}`,
        mimeType: "application/json",
        text: JSON.stringify({ testCase: testCase[0], scenarios: caseScenarios }, null, 2),
      },
    ],
  };
}

// Test run resources

async function getTestRunsList(auth: AuthContext) {
  const runs = await db
    .select({
      id: testRuns.id,
      name: testRuns.name,
      status: testRuns.status,
      linearProjectName: testRuns.linearProjectName,
      linearMilestoneName: testRuns.linearMilestoneName,
      linearIssueIdentifier: testRuns.linearIssueIdentifier,
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
