import { eq, and, desc } from "drizzle-orm";
import { db, testCases, testCaseAuditLog, users } from "../shared/index.js";
import { AuthContext } from "../auth/index.js";
import type { Resource } from "@modelcontextprotocol/sdk/types.js";

export function registerTestCaseResources(): Resource[] {
  return [
    {
      uri: "test-cases://list",
      name: "Test Cases List",
      description: "List test cases with optional filtering by folderId and state",
      mimeType: "application/json",
    },
    {
      uri: "test-cases://{id}",
      name: "Single Test Case",
      description: "Get a specific test case with full details",
      mimeType: "application/json",
    },
    {
      uri: "test-cases://{id}/audit",
      name: "Test Case Audit Log",
      description: "Get the audit history for a test case",
      mimeType: "application/json",
    },
  ];
}

export async function handleTestCaseResource(
  uri: string,
  auth: AuthContext
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  // Parse query parameters from URI
  const urlObj = new URL(uri, "http://localhost");
  const pathname = urlObj.pathname.replace(/^\/\//, "");

  if (uri.startsWith("test-cases://list")) {
    const folderId = urlObj.searchParams.get("folderId");
    const state = urlObj.searchParams.get("state");
    return getTestCasesList(auth, folderId, state);
  }

  const auditMatch = uri.match(/^test-cases:\/\/(\d+)\/audit$/);
  if (auditMatch) {
    const id = parseInt(auditMatch[1], 10);
    return getTestCaseAudit(id, auth);
  }

  const singleMatch = uri.match(/^test-cases:\/\/(\d+)$/);
  if (singleMatch) {
    const id = parseInt(singleMatch[1], 10);
    return getSingleTestCase(id, auth);
  }

  throw new Error(`Invalid test case resource URI: ${uri}`);
}

async function getTestCasesList(
  auth: AuthContext,
  folderId: string | null,
  state: string | null
) {
  let query = db
    .select()
    .from(testCases)
    .where(eq(testCases.organizationId, auth.organizationId))
    .orderBy(desc(testCases.updatedAt));

  // Apply filters
  const conditions = [eq(testCases.organizationId, auth.organizationId)];

  if (folderId) {
    conditions.push(eq(testCases.folderId, parseInt(folderId, 10)));
  }

  if (state && ["active", "draft", "upcoming", "retired", "rejected"].includes(state)) {
    conditions.push(eq(testCases.state, state as "active" | "draft" | "upcoming" | "retired" | "rejected"));
  }

  const cases = await db
    .select()
    .from(testCases)
    .where(and(...conditions))
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
  const result = await db
    .select()
    .from(testCases)
    .where(
      and(
        eq(testCases.id, id),
        eq(testCases.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (result.length === 0) {
    throw new Error(`Test case not found: ${id}`);
  }

  return {
    contents: [
      {
        uri: `test-cases://${id}`,
        mimeType: "application/json",
        text: JSON.stringify(result[0], null, 2),
      },
    ],
  };
}

async function getTestCaseAudit(id: number, auth: AuthContext) {
  // First verify the test case exists and belongs to the org
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

  // Get audit log with user info
  const auditLog = await db
    .select({
      id: testCaseAuditLog.id,
      testCaseId: testCaseAuditLog.testCaseId,
      userId: testCaseAuditLog.userId,
      userName: users.name,
      action: testCaseAuditLog.action,
      changes: testCaseAuditLog.changes,
      previousValues: testCaseAuditLog.previousValues,
      newValues: testCaseAuditLog.newValues,
      createdAt: testCaseAuditLog.createdAt,
    })
    .from(testCaseAuditLog)
    .leftJoin(users, eq(testCaseAuditLog.userId, users.id))
    .where(eq(testCaseAuditLog.testCaseId, id))
    .orderBy(desc(testCaseAuditLog.createdAt));

  return {
    contents: [
      {
        uri: `test-cases://${id}/audit`,
        mimeType: "application/json",
        text: JSON.stringify(auditLog, null, 2),
      },
    ],
  };
}
