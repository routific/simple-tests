import { eq, and } from "drizzle-orm";
import { db, testCases, testCaseAuditLog, testCaseLinearIssues, folders, scenarios } from "../shared/index.js";
import { AuthContext, hasPermission } from "../auth/index.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function registerTestCaseTools(auth: AuthContext): Tool[] {
  const tools: Tool[] = [];

  if (hasPermission(auth, "write")) {
    tools.push(
      {
        name: "create_test_case",
        description: "Create a new test case with Gherkin BDD format. Creates a test case and a scenario with the gherkin content.",
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
              enum: ["active", "draft", "upcoming", "retired", "rejected"],
              description: "State of the test case (default: active)",
            },
            priority: {
              type: "string",
              enum: ["normal", "high", "critical"],
              description: "Priority level (default: normal)",
            },
            scenarioTitle: {
              type: "string",
              description: "Title for the scenario (defaults to test case title)",
            },
          },
          required: ["title", "gherkin"],
        },
      },
      {
        name: "update_test_case",
        description: "Update an existing test case. Note: To update gherkin content, use the scenarios directly.",
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
            folderId: {
              type: "number",
              description: "New folder ID",
            },
            state: {
              type: "string",
              enum: ["active", "draft", "upcoming", "retired", "rejected"],
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
      },
      {
        name: "link_linear_issue",
        description: "Link a Linear issue to a test case. Requires the Linear issue ID, identifier (e.g., ENG-123), and title.",
        inputSchema: {
          type: "object",
          properties: {
            testCaseId: {
              type: "number",
              description: "ID of the test case to link the issue to",
            },
            linearIssueId: {
              type: "string",
              description: "The Linear issue UUID",
            },
            linearIssueIdentifier: {
              type: "string",
              description: "The Linear issue identifier (e.g., ENG-123)",
            },
            linearIssueTitle: {
              type: "string",
              description: "The Linear issue title",
            },
          },
          required: ["testCaseId", "linearIssueId", "linearIssueIdentifier", "linearIssueTitle"],
        },
      },
      {
        name: "unlink_linear_issue",
        description: "Unlink a Linear issue from a test case",
        inputSchema: {
          type: "object",
          properties: {
            testCaseId: {
              type: "number",
              description: "ID of the test case",
            },
            linearIssueId: {
              type: "string",
              description: "The Linear issue UUID to unlink",
            },
          },
          required: ["testCaseId", "linearIssueId"],
        },
      },
      {
        name: "get_linked_issues",
        description: "Get all Linear issues linked to a test case",
        inputSchema: {
          type: "object",
          properties: {
            testCaseId: {
              type: "number",
              description: "ID of the test case",
            },
          },
          required: ["testCaseId"],
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
    case "link_linear_issue":
      return linkLinearIssue(args, auth);
    case "unlink_linear_issue":
      return unlinkLinearIssue(args, auth);
    case "get_linked_issues":
      return getLinkedIssues(args, auth);
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
  try {
    const { title, gherkin, folderId, state, priority, scenarioTitle } = args as {
      title: string;
      gherkin: string;
      folderId?: number;
      state?: "active" | "draft" | "retired" | "rejected";
      priority?: "normal" | "high" | "critical";
      scenarioTitle?: string;
    };

    console.error(`[MCP] createTestCase called with: title="${title}", folderId=${folderId}, orgId=${auth.organizationId}, userId=${auth.userId}`);

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

    // Create the test case
    console.error(`[MCP] Inserting test case...`);
    const result = await db
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

    const testCase = result[0];
    console.error(`[MCP] Test case created with id: ${testCase.id}`);

    // Create a scenario with the gherkin content
    console.error(`[MCP] Inserting scenario...`);
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
    console.error(`[MCP] Scenario created with id: ${scenario.id}`);

    // Create audit log entry
    console.error(`[MCP] Creating audit log...`);
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

    console.error(`[MCP] createTestCase completed successfully`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, testCase, scenario }, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[MCP] createTestCase error:`, errorMessage, errorStack);
    return {
      content: [
        {
          type: "text",
          text: `Error creating test case: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
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

  // Note: gherkin is now stored in scenarios table, not on test cases
  // Use update_scenario tool to update gherkin content

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

async function linkLinearIssue(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { testCaseId, linearIssueId, linearIssueIdentifier, linearIssueTitle } = args as {
    testCaseId: number;
    linearIssueId: string;
    linearIssueIdentifier: string;
    linearIssueTitle: string;
  };

  if (!testCaseId || !linearIssueId || !linearIssueIdentifier || !linearIssueTitle) {
    return {
      content: [{ type: "text", text: "Error: testCaseId, linearIssueId, linearIssueIdentifier, and linearIssueTitle are required" }],
      isError: true,
    };
  }

  // Verify test case exists and belongs to org
  const existing = await db
    .select()
    .from(testCases)
    .where(
      and(
        eq(testCases.id, testCaseId),
        eq(testCases.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    return {
      content: [{ type: "text", text: `Error: Test case not found: ${testCaseId}` }],
      isError: true,
    };
  }

  // Check if the link already exists
  const existingLink = await db
    .select()
    .from(testCaseLinearIssues)
    .where(
      and(
        eq(testCaseLinearIssues.testCaseId, testCaseId),
        eq(testCaseLinearIssues.linearIssueId, linearIssueId)
      )
    )
    .limit(1);

  if (existingLink.length > 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Link already exists",
            link: existingLink[0],
          }, null, 2),
        },
      ],
    };
  }

  // Create the link
  const result = await db
    .insert(testCaseLinearIssues)
    .values({
      testCaseId,
      linearIssueId,
      linearIssueIdentifier,
      linearIssueTitle,
      linkedBy: auth.userId,
    })
    .returning();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, link: result[0] }, null, 2),
      },
    ],
  };
}

async function unlinkLinearIssue(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { testCaseId, linearIssueId } = args as {
    testCaseId: number;
    linearIssueId: string;
  };

  if (!testCaseId || !linearIssueId) {
    return {
      content: [{ type: "text", text: "Error: testCaseId and linearIssueId are required" }],
      isError: true,
    };
  }

  // Verify test case exists and belongs to org
  const existing = await db
    .select()
    .from(testCases)
    .where(
      and(
        eq(testCases.id, testCaseId),
        eq(testCases.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    return {
      content: [{ type: "text", text: `Error: Test case not found: ${testCaseId}` }],
      isError: true,
    };
  }

  // Delete the link
  const deleted = await db
    .delete(testCaseLinearIssues)
    .where(
      and(
        eq(testCaseLinearIssues.testCaseId, testCaseId),
        eq(testCaseLinearIssues.linearIssueId, linearIssueId)
      )
    )
    .returning();

  if (deleted.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            message: "Link not found (may have already been removed)",
          }, null, 2),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, unlinked: deleted[0] }, null, 2),
      },
    ],
  };
}

async function getLinkedIssues(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { testCaseId } = args as { testCaseId: number };

  if (!testCaseId) {
    return {
      content: [{ type: "text", text: "Error: testCaseId is required" }],
      isError: true,
    };
  }

  // Verify test case exists and belongs to org
  const existing = await db
    .select()
    .from(testCases)
    .where(
      and(
        eq(testCases.id, testCaseId),
        eq(testCases.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    return {
      content: [{ type: "text", text: `Error: Test case not found: ${testCaseId}` }],
      isError: true,
    };
  }

  // Get all linked issues
  const links = await db
    .select({
      id: testCaseLinearIssues.id,
      linearIssueId: testCaseLinearIssues.linearIssueId,
      linearIssueIdentifier: testCaseLinearIssues.linearIssueIdentifier,
      linearIssueTitle: testCaseLinearIssues.linearIssueTitle,
      linkedAt: testCaseLinearIssues.linkedAt,
    })
    .from(testCaseLinearIssues)
    .where(eq(testCaseLinearIssues.testCaseId, testCaseId));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          testCaseId,
          linkedIssues: links,
        }, null, 2),
      },
    ],
  };
}
