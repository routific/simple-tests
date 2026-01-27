"use server";

import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";
import { undoMcpWriteOperation } from "@/lib/mcp/audit-log";
import { db } from "@/lib/db";
import { users, mcpWriteLog } from "@/lib/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";

export async function getLogsWithUsers(options?: {
  limit?: number;
  offset?: number;
  showUndone?: boolean;
}) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { limit = 20, offset = 0, showUndone = false } = options || {};

  try {
    // Build conditions
    const conditions = [eq(mcpWriteLog.organizationId, session.user.organizationId)];
    if (!showUndone) {
      conditions.push(isNull(mcpWriteLog.undoneAt));
    }

    // Get logs with user info
    const logs = await db
      .select({
        log: mcpWriteLog,
        user: users,
      })
      .from(mcpWriteLog)
      .leftJoin(users, eq(mcpWriteLog.userId, users.id))
      .where(and(...conditions))
      .orderBy(desc(mcpWriteLog.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const allLogs = await db
      .select({ id: mcpWriteLog.id })
      .from(mcpWriteLog)
      .where(and(...conditions));

    return {
      logs: logs.map((row) => ({
        ...row.log,
        userName: row.user?.name || "Unknown",
        userEmail: row.user?.email || "Unknown",
      })),
      total: allLogs.length,
      hasMore: offset + logs.length < allLogs.length,
    };
  } catch (error) {
    console.error("[MCP Logs] Error fetching logs:", error);
    return { error: "Failed to fetch logs" };
  }
}

export async function undoOperation(logId: number) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  try {
    const result = await undoMcpWriteOperation(
      logId,
      session.user.id,
      session.user.organizationId
    );

    if (!result.success) {
      return { error: result.error || "Failed to undo operation" };
    }

    revalidatePath("/settings/connect");
    revalidatePath("/cases");
    revalidatePath("/runs");

    return { success: true };
  } catch (error) {
    console.error("[MCP Logs] Error undoing operation:", error);
    return { error: "Failed to undo operation" };
  }
}
