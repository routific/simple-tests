import { eq, and } from "drizzle-orm";
import { db, testCases, testCaseAuditLog, folders } from "../shared/index.js";
import { AuthContext, hasPermission } from "../auth/index.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function registerTestCaseTools(auth: AuthContext): Tool[] {
  const tools: Tool[] = [];

  if (hasPermission(auth, "write")) {
    tools.push(
      {
        name: "create_test_case",
        description: "Create a new test case with Gherkin BDD format",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Title of the test case",
            },
            gherkin: {
              type: "string",
              description: "Gherkin BDD specification (Feature, Scenario, Given/When/Then)",
            },
            folderId: {
              type: "number",
              description: "ID of the folder to place the test case in",
            },
            state: {
              type: "string",
              enum: ["active", "draft", "retired", "rejected"],
              description: "State of the test case (default: active)",
            },
            priority: {
              type: "string",
              enum: ["normal", "high", "critical"],
              description: "Priority level (default: normal)",
            },
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
            id: {
              type: "number",
              description: "ID of the test case to update",
            },
            title: {
              type: "string",
              description: "New title",
            },
            gherkin: {
              type: "string",
              description: "New Gherkin specification",
            },
            folderId: {
              type: "number",
              description: "New folder ID",
            },
            state: {
              type: "string",
              enum: ["active", "draft", "retired", "rejected"],
              description: "New state",
            },
            priority: {
              type: "string",
              enum: ["normal", "high", "critical"],
              description: "New priority",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "delete_test_case",
        description: "Delete a test case",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "ID of the test case to delete",
            },
          },
          required: ["id"],
        },
      }
    );
  }

  return tools;
}

export async function handleTestCaseTool(
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
    case "create_test_case":
      return createTestCase(args, auth);
    case "update_test_case":
      return updateTestCase(args, auth);
    case "delete_test_case":
      return deleteTestCase(args, auth);
    default:
      return {
        content: [{ type: "text", text: `Unknown test case tool: ${name}` }],
        isError: true,
      };
  }
}

async function createTestCase(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { title, gherkin, folderId, state, priority } = args as {
    title: string;
    gherkin: string;
    folderId?: number;
    state?: "active" | "draft" | "retired" | "rejected";
    priority?: "normal" | "high" | "critical";
  };

  if (!title || !gherkin) {
    return {
      content: [{ type: "text", text: "Error: title and gherkin are required" }],
      isError: true,
    };
  }

  // If folderId specified, verify it exists
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
  const result = await db
    .insert(testCases)
    .values({
      title,
      gherkin,
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

  const testCase = result[0];

  // Create audit log entry
  await db.insert(testCaseAuditLog).values({
    testCaseId: testCase.id,
    userId: auth.userId,
    action: "created",
    changes: JSON.stringify(["title", "gherkin", "state", "priority", "folderId"]),
    newValues: JSON.stringify({
      title,
      gherkin,
      state: testCase.state,
      priority: testCase.priority,
      folderId: testCase.folderId,
    }),
    createdAt: now,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, testCase }, null, 2),
      },
    ],
  };
}

async function updateTestCase(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { id, title, gherkin, folderId, state, priority } = args as {
    id: number;
    title?: string;
    gherkin?: string;
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

  const oldTestCase = existing[0];

  // If folderId specified, verify it exists
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

  // Build update object and track changes
  const updates: Partial<typeof testCases.$inferInsert> = {
    updatedBy: auth.userId,
    updatedAt: new Date(),
  };
  const changes: string[] = [];
  const previousValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};

  if (title !== undefined && title !== oldTestCase.title) {
    updates.title = title;
    changes.push("title");
    previousValues.title = oldTestCase.title;
    newValues.title = title;
  }

  if (gherkin !== undefined && gherkin !== oldTestCase.gherkin) {
    updates.gherkin = gherkin;
    changes.push("gherkin");
    previousValues.gherkin = oldTestCase.gherkin;
    newValues.gherkin = gherkin;
  }

  if (folderId !== undefined && folderId !== oldTestCase.folderId) {
    updates.folderId = folderId ?? null;
    changes.push("folderId");
    previousValues.folderId = oldTestCase.folderId;
    newValues.folderId = folderId;
  }

  if (state !== undefined && state !== oldTestCase.state) {
    updates.state = state;
    changes.push("state");
    previousValues.state = oldTestCase.state;
    newValues.state = state;
  }

  if (priority !== undefined && priority !== oldTestCase.priority) {
    updates.priority = priority;
    changes.push("priority");
    previousValues.priority = oldTestCase.priority;
    newValues.priority = priority;
  }

  if (changes.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, message: "No changes made", testCase: oldTestCase }, null, 2),
        },
      ],
    };
  }

  const result = await db
    .update(testCases)
    .set(updates)
    .where(eq(testCases.id, id))
    .returning();

  // Create audit log entry
  await db.insert(testCaseAuditLog).values({
    testCaseId: id,
    userId: auth.userId,
    action: "updated",
    changes: JSON.stringify(changes),
    previousValues: JSON.stringify(previousValues),
    newValues: JSON.stringify(newValues),
    createdAt: new Date(),
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, testCase: result[0], changes }, null, 2),
      },
    ],
  };
}

async function deleteTestCase(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { id } = args as { id: number };

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

  const oldTestCase = existing[0];

  // Create audit log entry before deletion
  await db.insert(testCaseAuditLog).values({
    testCaseId: id,
    userId: auth.userId,
    action: "deleted",
    changes: JSON.stringify(["deleted"]),
    previousValues: JSON.stringify(oldTestCase),
    createdAt: new Date(),
  });

  // Delete the test case (audit log entries will be cascade deleted)
  await db.delete(testCases).where(eq(testCases.id, id));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, deletedId: id }, null, 2),
      },
    ],
  };
}
