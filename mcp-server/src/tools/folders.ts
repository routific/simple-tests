import { eq, and, sql } from "drizzle-orm";
import { db, folders, testCases } from "../shared/index.js";
import { AuthContext, hasPermission } from "../auth/index.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export function registerFolderTools(auth: AuthContext): Tool[] {
  const tools: Tool[] = [];

  if (hasPermission(auth, "write")) {
    tools.push(
      {
        name: "create_folder",
        description: "Create a new folder in the test case hierarchy",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Name of the folder",
            },
            parentId: {
              type: "number",
              description: "ID of the parent folder (null for root level)",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "rename_folder",
        description: "Rename an existing folder",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "ID of the folder to rename",
            },
            name: {
              type: "string",
              description: "New name for the folder",
            },
          },
          required: ["id", "name"],
        },
      },
      {
        name: "delete_folder",
        description: "Delete an empty folder (must have no children or test cases)",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "ID of the folder to delete",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "move_folder",
        description: "Move a folder to a new parent",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "number",
              description: "ID of the folder to move",
            },
            newParentId: {
              type: "number",
              description: "ID of the new parent folder (null for root level)",
            },
            order: {
              type: "number",
              description: "New order position within the parent",
            },
          },
          required: ["id"],
        },
      }
    );
  }

  return tools;
}

export async function handleFolderTool(
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
    case "rename_folder":
      return renameFolder(args, auth);
    case "delete_folder":
      return deleteFolder(args, auth);
    case "move_folder":
      return moveFolder(args, auth);
    default:
      return {
        content: [{ type: "text", text: `Unknown folder tool: ${name}` }],
        isError: true,
      };
  }
}

async function createFolder(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { name, parentId } = args as { name: string; parentId?: number };

  if (!name || typeof name !== "string") {
    return {
      content: [{ type: "text", text: "Error: name is required" }],
      isError: true,
    };
  }

  // If parentId specified, verify it exists and belongs to org
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

  // Get max order for siblings
  const maxOrder = await db
    .select({ maxOrder: sql<number>`COALESCE(MAX(${folders.order}), -1)` })
    .from(folders)
    .where(
      and(
        parentId ? eq(folders.parentId, parentId) : sql`${folders.parentId} IS NULL`,
        eq(folders.organizationId, auth.organizationId)
      )
    );

  const newOrder = (maxOrder[0]?.maxOrder ?? -1) + 1;

  const result = await db
    .insert(folders)
    .values({
      name,
      parentId: parentId ?? null,
      order: newOrder,
      organizationId: auth.organizationId,
    })
    .returning();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, folder: result[0] }, null, 2),
      },
    ],
  };
}

async function renameFolder(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { id, name } = args as { id: number; name: string };

  if (!id || !name) {
    return {
      content: [{ type: "text", text: "Error: id and name are required" }],
      isError: true,
    };
  }

  // Verify folder exists and belongs to org
  const existing = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, id),
        eq(folders.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    return {
      content: [{ type: "text", text: `Error: Folder not found: ${id}` }],
      isError: true,
    };
  }

  const result = await db
    .update(folders)
    .set({ name })
    .where(eq(folders.id, id))
    .returning();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, folder: result[0] }, null, 2),
      },
    ],
  };
}

async function deleteFolder(
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

  // Verify folder exists and belongs to org
  const existing = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, id),
        eq(folders.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    return {
      content: [{ type: "text", text: `Error: Folder not found: ${id}` }],
      isError: true,
    };
  }

  // Check for child folders
  const children = await db
    .select({ count: sql<number>`count(*)` })
    .from(folders)
    .where(eq(folders.parentId, id));

  if (children[0].count > 0) {
    return {
      content: [{ type: "text", text: "Error: Cannot delete folder with child folders" }],
      isError: true,
    };
  }

  // Check for test cases
  const cases = await db
    .select({ count: sql<number>`count(*)` })
    .from(testCases)
    .where(eq(testCases.folderId, id));

  if (cases[0].count > 0) {
    return {
      content: [{ type: "text", text: "Error: Cannot delete folder with test cases" }],
      isError: true,
    };
  }

  await db.delete(folders).where(eq(folders.id, id));

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, deletedId: id }, null, 2),
      },
    ],
  };
}

async function moveFolder(
  args: Record<string, unknown>,
  auth: AuthContext
): Promise<CallToolResult> {
  const { id, newParentId, order } = args as {
    id: number;
    newParentId?: number;
    order?: number;
  };

  if (!id) {
    return {
      content: [{ type: "text", text: "Error: id is required" }],
      isError: true,
    };
  }

  // Verify folder exists and belongs to org
  const existing = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, id),
        eq(folders.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (existing.length === 0) {
    return {
      content: [{ type: "text", text: `Error: Folder not found: ${id}` }],
      isError: true,
    };
  }

  // If newParentId specified, verify it exists
  if (newParentId !== undefined && newParentId !== null) {
    const parent = await db
      .select()
      .from(folders)
      .where(
        and(
          eq(folders.id, newParentId),
          eq(folders.organizationId, auth.organizationId)
        )
      )
      .limit(1);

    if (parent.length === 0) {
      return {
        content: [{ type: "text", text: `Error: Parent folder not found: ${newParentId}` }],
        isError: true,
      };
    }

    // Prevent moving folder into itself or its descendants
    if (newParentId === id) {
      return {
        content: [{ type: "text", text: "Error: Cannot move folder into itself" }],
        isError: true,
      };
    }
  }

  const updates: Partial<{ parentId: number | null; order: number }> = {};

  if (newParentId !== undefined) {
    updates.parentId = newParentId ?? null;
  }

  if (order !== undefined) {
    updates.order = order;
  }

  const result = await db
    .update(folders)
    .set(updates)
    .where(eq(folders.id, id))
    .returning();

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ success: true, folder: result[0] }, null, 2),
      },
    ],
  };
}
