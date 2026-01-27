import { db } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import {
  mcpWriteLog,
  folders,
  testCases,
  scenarios,
  testRuns,
  testRunResults,
} from "@/lib/db/schema";
import type { AuthContext } from "./auth";

export type EntityType = "folder" | "test_case" | "scenario" | "test_run" | "test_result";

export interface AuditLogEntry {
  toolName: string;
  toolArgs: Record<string, unknown>;
  entityType: EntityType;
  entityId?: number;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  status: "success" | "failed";
  errorMessage?: string;
}

interface AuditContext {
  auth: AuthContext;
  clientId: string;
  sessionId?: string;
}

/**
 * Log an MCP write operation for audit and undo purposes
 */
export async function logMcpWriteOperation(
  ctx: AuditContext,
  entry: AuditLogEntry
): Promise<number> {
  const result = await db
    .insert(mcpWriteLog)
    .values({
      organizationId: ctx.auth.organizationId,
      userId: ctx.auth.userId,
      clientId: ctx.clientId,
      sessionId: ctx.sessionId,
      toolName: entry.toolName,
      toolArgs: JSON.stringify(entry.toolArgs),
      entityType: entry.entityType,
      entityId: entry.entityId,
      beforeState: entry.beforeState ? JSON.stringify(entry.beforeState) : null,
      afterState: entry.afterState ? JSON.stringify(entry.afterState) : null,
      status: entry.status,
      errorMessage: entry.errorMessage,
    })
    .returning({ id: mcpWriteLog.id });

  return result[0].id;
}

/**
 * Get the current state of an entity for before-state capture
 */
export async function getEntityState(
  entityType: EntityType,
  entityId: number,
  organizationId: string
): Promise<Record<string, unknown> | null> {
  switch (entityType) {
    case "folder": {
      const folder = await db
        .select()
        .from(folders)
        .where(and(eq(folders.id, entityId), eq(folders.organizationId, organizationId)))
        .limit(1);
      return folder[0] ? { ...folder[0] } : null;
    }
    case "test_case": {
      const testCase = await db
        .select()
        .from(testCases)
        .where(and(eq(testCases.id, entityId), eq(testCases.organizationId, organizationId)))
        .limit(1);
      if (!testCase[0]) return null;
      // Include scenarios in the state
      const testCaseScenarios = await db
        .select()
        .from(scenarios)
        .where(eq(scenarios.testCaseId, entityId));
      return { ...testCase[0], scenarios: testCaseScenarios };
    }
    case "scenario": {
      const scenario = await db
        .select()
        .from(scenarios)
        .where(eq(scenarios.id, entityId))
        .limit(1);
      return scenario[0] ? { ...scenario[0] } : null;
    }
    case "test_run": {
      const testRun = await db
        .select()
        .from(testRuns)
        .where(and(eq(testRuns.id, entityId), eq(testRuns.organizationId, organizationId)))
        .limit(1);
      if (!testRun[0]) return null;
      // Include results in the state
      const results = await db
        .select()
        .from(testRunResults)
        .where(eq(testRunResults.testRunId, entityId));
      return { ...testRun[0], results };
    }
    case "test_result": {
      const result = await db
        .select()
        .from(testRunResults)
        .where(eq(testRunResults.id, entityId))
        .limit(1);
      return result[0] ? { ...result[0] } : null;
    }
    default:
      return null;
  }
}

/**
 * Undo an MCP write operation by restoring the before state
 */
export async function undoMcpWriteOperation(
  logId: number,
  undoneByUserId: string,
  organizationId: string
): Promise<{ success: boolean; error?: string }> {
  // Get the log entry
  const logEntry = await db
    .select()
    .from(mcpWriteLog)
    .where(
      and(
        eq(mcpWriteLog.id, logId),
        eq(mcpWriteLog.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!logEntry[0]) {
    return { success: false, error: "Log entry not found" };
  }

  const entry = logEntry[0];

  if (entry.status !== "success") {
    return { success: false, error: "Cannot undo a failed operation" };
  }

  if (entry.undoneAt) {
    return { success: false, error: "Operation already undone" };
  }

  try {
    // Determine the undo action based on the tool
    if (entry.toolName.startsWith("create_")) {
      // For creates, delete the created entity
      if (!entry.entityId) {
        return { success: false, error: "No entity ID to delete" };
      }
      await deleteEntity(entry.entityType, entry.entityId);
    } else if (entry.toolName.startsWith("update_")) {
      // For updates, restore the before state
      if (!entry.beforeState || !entry.entityId) {
        return { success: false, error: "No before state to restore" };
      }
      const beforeState = JSON.parse(entry.beforeState);
      await restoreEntity(entry.entityType, entry.entityId, beforeState);
    } else {
      return { success: false, error: `Cannot undo operation: ${entry.toolName}` };
    }

    // Mark the log entry as undone
    await db
      .update(mcpWriteLog)
      .set({
        undoneAt: new Date(),
        undoneBy: undoneByUserId,
      })
      .where(eq(mcpWriteLog.id, logId));

    return { success: true };
  } catch (error) {
    console.error("[MCP Audit] Undo error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function deleteEntity(entityType: EntityType, entityId: number): Promise<void> {
  switch (entityType) {
    case "folder":
      await db.delete(folders).where(eq(folders.id, entityId));
      break;
    case "test_case":
      // Scenarios are cascade deleted
      await db.delete(testCases).where(eq(testCases.id, entityId));
      break;
    case "scenario":
      await db.delete(scenarios).where(eq(scenarios.id, entityId));
      break;
    case "test_run":
      // Results are cascade deleted
      await db.delete(testRuns).where(eq(testRuns.id, entityId));
      break;
    case "test_result":
      await db.delete(testRunResults).where(eq(testRunResults.id, entityId));
      break;
  }
}

async function restoreEntity(
  entityType: EntityType,
  entityId: number,
  beforeState: Record<string, unknown>
): Promise<void> {
  switch (entityType) {
    case "folder":
      await db
        .update(folders)
        .set({
          name: beforeState.name as string,
          parentId: beforeState.parentId as number | null,
          order: beforeState.order as number,
        })
        .where(eq(folders.id, entityId));
      break;
    case "test_case":
      await db
        .update(testCases)
        .set({
          title: beforeState.title as string,
          folderId: beforeState.folderId as number | null,
          state: beforeState.state as "active" | "draft" | "retired" | "rejected",
          priority: beforeState.priority as "normal" | "high" | "critical",
          updatedAt: new Date(),
        })
        .where(eq(testCases.id, entityId));
      break;
    case "scenario":
      await db
        .update(scenarios)
        .set({
          title: beforeState.title as string,
          gherkin: beforeState.gherkin as string,
          order: beforeState.order as number,
          updatedAt: new Date(),
        })
        .where(eq(scenarios.id, entityId));
      break;
    case "test_run":
      await db
        .update(testRuns)
        .set({
          name: beforeState.name as string,
          status: beforeState.status as "in_progress" | "completed",
        })
        .where(eq(testRuns.id, entityId));
      break;
    case "test_result":
      await db
        .update(testRunResults)
        .set({
          status: beforeState.status as "pending" | "passed" | "failed" | "blocked" | "skipped",
          notes: beforeState.notes as string | null,
          executedAt: beforeState.executedAt as Date | null,
          executedBy: beforeState.executedBy as string | null,
        })
        .where(eq(testRunResults.id, entityId));
      break;
  }
}

/**
 * Get MCP write logs for an organization
 */
export async function getMcpWriteLogs(
  organizationId: string,
  options?: {
    limit?: number;
    offset?: number;
    userId?: string;
    toolName?: string;
    entityType?: EntityType;
    includeUndone?: boolean;
  }
) {
  const { limit = 50, offset = 0, includeUndone = true } = options || {};

  // Build query with filters
  let query = db
    .select()
    .from(mcpWriteLog)
    .where(eq(mcpWriteLog.organizationId, organizationId))
    .orderBy(mcpWriteLog.createdAt)
    .limit(limit)
    .offset(offset);

  const logs = await query;

  // Apply additional filters in memory (drizzle doesn't support dynamic where clauses well)
  let filtered = logs;

  if (options?.userId) {
    filtered = filtered.filter((log) => log.userId === options.userId);
  }

  if (options?.toolName) {
    filtered = filtered.filter((log) => log.toolName === options.toolName);
  }

  if (options?.entityType) {
    filtered = filtered.filter((log) => log.entityType === options.entityType);
  }

  if (!includeUndone) {
    filtered = filtered.filter((log) => !log.undoneAt);
  }

  return filtered;
}
