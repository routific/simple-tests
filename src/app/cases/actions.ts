"use server";

import { db } from "@/lib/db";
import { testCases, scenarios, testCaseAuditLog, testCaseLinearIssues, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";
import { recordUndo } from "./undo-actions";

interface LinkedIssue {
  id: string;
  identifier: string;
  title: string;
}

interface SaveTestCaseInput {
  id?: number;
  title: string;
  folderId: number | null;
  state: "active" | "draft" | "upcoming" | "retired" | "rejected";
  linkedIssues?: LinkedIssue[];
}

// Helper to compute diff between two objects
function computeDiff(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>
): { field: string; oldValue: unknown; newValue: unknown }[] {
  const changes: { field: string; oldValue: unknown; newValue: unknown }[] = [];

  const allKeys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]));

  for (const key of allKeys) {
    const oldVal = oldValues[key];
    const newVal = newValues[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        field: key,
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  return changes;
}

export async function saveTestCase(input: SaveTestCaseInput) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;
  const userId = session.user.id;

  try {
    if (input.id) {
      // Get current values for audit log
      const existing = await db
        .select()
        .from(testCases)
        .where(
          and(
            eq(testCases.id, input.id),
            eq(testCases.organizationId, organizationId)
          )
        )
        .get();

      if (!existing) {
        return { error: "Test case not found" };
      }

      const oldValues = {
        title: existing.title,
        folderId: existing.folderId,
        state: existing.state,
      };

      const newValues = {
        title: input.title,
        folderId: input.folderId,
        state: input.state,
      };

      const changes = computeDiff(oldValues, newValues);

      // Update existing
      await db
        .update(testCases)
        .set({
          title: input.title,
          folderId: input.folderId,
          state: input.state,
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(
          and(
            eq(testCases.id, input.id),
            eq(testCases.organizationId, organizationId)
          )
        );

      // Create audit log entry if there were changes
      if (changes.length > 0) {
        await db.insert(testCaseAuditLog).values({
          testCaseId: input.id,
          userId,
          action: "updated",
          changes: JSON.stringify(changes),
          previousValues: JSON.stringify(oldValues),
          newValues: JSON.stringify(newValues),
        });

        // Record undo action
        await recordUndo("update_test_case", `Update "${existing.title}"`, {
          testCaseId: input.id,
          previousValues: {
            title: existing.title,
            folderId: existing.folderId,
            state: existing.state,
            priority: existing.priority,
            order: existing.order,
          },
        });
      }

      // Update linked issues if provided
      if (input.linkedIssues !== undefined) {
        await updateLinkedIssues(input.id, input.linkedIssues, userId);
      }

      revalidatePath("/cases");
      revalidatePath(`/cases/${input.id}`);

      return { success: true, id: input.id };
    } else {
      // Create new
      const result = await db
        .insert(testCases)
        .values({
          title: input.title,
          folderId: input.folderId,
          state: input.state,
          organizationId,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning({ id: testCases.id });

      const newId = result[0].id;

      // Create audit log entry for creation
      await db.insert(testCaseAuditLog).values({
        testCaseId: newId,
        userId,
        action: "created",
        changes: JSON.stringify([]),
        previousValues: null,
        newValues: JSON.stringify({
          title: input.title,
          folderId: input.folderId,
          state: input.state,
        }),
      });

      // Record undo action
      await recordUndo("create_test_case", `Create "${input.title}"`, {
        testCaseId: newId,
      });

      // Add linked issues if provided
      if (input.linkedIssues && input.linkedIssues.length > 0) {
        await updateLinkedIssues(newId, input.linkedIssues, userId);
      }

      revalidatePath("/cases");

      return { success: true, id: newId };
    }
  } catch (error) {
    console.error("Failed to save test case:", error);
    return { error: "Failed to save test case" };
  }
}

// Helper to update linked issues for a test case
async function updateLinkedIssues(
  testCaseId: number,
  linkedIssues: LinkedIssue[],
  userId: string
) {
  // Delete existing links
  await db
    .delete(testCaseLinearIssues)
    .where(eq(testCaseLinearIssues.testCaseId, testCaseId));

  // Insert new links
  if (linkedIssues.length > 0) {
    await db.insert(testCaseLinearIssues).values(
      linkedIssues.map((issue) => ({
        testCaseId,
        linearIssueId: issue.id,
        linearIssueIdentifier: issue.identifier,
        linearIssueTitle: issue.title,
        linkedBy: userId,
      }))
    );
  }
}

// Get linked issues for a test case
export async function getLinkedIssues(testCaseId: number) {
  const session = await getSessionWithOrg();
  if (!session) {
    return [];
  }

  const { organizationId } = session.user;

  // Verify test case belongs to organization
  const testCase = await db
    .select()
    .from(testCases)
    .where(
      and(
        eq(testCases.id, testCaseId),
        eq(testCases.organizationId, organizationId)
      )
    )
    .get();

  if (!testCase) {
    return [];
  }

  const links = await db
    .select({
      id: testCaseLinearIssues.linearIssueId,
      identifier: testCaseLinearIssues.linearIssueIdentifier,
      title: testCaseLinearIssues.linearIssueTitle,
    })
    .from(testCaseLinearIssues)
    .where(eq(testCaseLinearIssues.testCaseId, testCaseId));

  return links;
}

export async function deleteTestCase(id: number) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;
  const userId = session.user.id;

  try {
    // Get current values for audit log and undo
    const existing = await db
      .select()
      .from(testCases)
      .where(
        and(
          eq(testCases.id, id),
          eq(testCases.organizationId, organizationId)
        )
      )
      .get();

    if (!existing) {
      return { error: "Test case not found" };
    }

    // Get all scenarios for this test case (for undo)
    const existingScenarios = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.testCaseId, id));

    // Record undo action BEFORE deleting
    await recordUndo("delete_test_case", `Delete "${existing.title}"`, {
      testCase: {
        id: existing.id,
        legacyId: existing.legacyId,
        title: existing.title,
        folderId: existing.folderId,
        order: existing.order,
        template: existing.template,
        state: existing.state,
        priority: existing.priority,
        createdAt: existing.createdAt.getTime(),
        updatedAt: existing.updatedAt.getTime(),
      },
      scenarios: existingScenarios.map((s) => ({
        id: s.id,
        title: s.title,
        gherkin: s.gherkin,
        order: s.order,
        createdAt: s.createdAt.getTime(),
        updatedAt: s.updatedAt.getTime(),
      })),
    });

    // Create audit log entry for deletion
    await db.insert(testCaseAuditLog).values({
      testCaseId: id,
      userId,
      action: "deleted",
      changes: JSON.stringify([]),
      previousValues: JSON.stringify({
        title: existing.title,
        folderId: existing.folderId,
        state: existing.state,
      }),
      newValues: null,
    });

    await db
      .delete(testCases)
      .where(
        and(
          eq(testCases.id, id),
          eq(testCases.organizationId, organizationId)
        )
      );

    revalidatePath("/cases");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete test case:", error);
    return { error: "Failed to delete test case" };
  }
}

export async function getAllAuditLogs(limit = 100) {
  const session = await getSessionWithOrg();
  if (!session) {
    return [];
  }

  const { organizationId } = session.user;

  const logs = await db
    .select({
      id: testCaseAuditLog.id,
      testCaseId: testCaseAuditLog.testCaseId,
      testCaseTitle: testCases.title,
      userId: testCaseAuditLog.userId,
      action: testCaseAuditLog.action,
      changes: testCaseAuditLog.changes,
      previousValues: testCaseAuditLog.previousValues,
      newValues: testCaseAuditLog.newValues,
      createdAt: testCaseAuditLog.createdAt,
      userName: users.name,
      userAvatar: users.avatar,
    })
    .from(testCaseAuditLog)
    .innerJoin(testCases, eq(testCaseAuditLog.testCaseId, testCases.id))
    .leftJoin(users, eq(testCaseAuditLog.userId, users.id))
    .where(eq(testCases.organizationId, organizationId))
    .orderBy(testCaseAuditLog.createdAt)
    .limit(limit);

  return logs.reverse(); // Return newest first
}

export async function getTestCaseAuditLog(testCaseId: number) {
  const session = await getSessionWithOrg();
  if (!session) {
    return [];
  }

  const { organizationId } = session.user;

  // Verify test case belongs to organization
  const testCase = await db
    .select()
    .from(testCases)
    .where(
      and(
        eq(testCases.id, testCaseId),
        eq(testCases.organizationId, organizationId)
      )
    )
    .get();

  if (!testCase) {
    return [];
  }

  const logs = await db
    .select({
      id: testCaseAuditLog.id,
      testCaseId: testCaseAuditLog.testCaseId,
      userId: testCaseAuditLog.userId,
      action: testCaseAuditLog.action,
      changes: testCaseAuditLog.changes,
      previousValues: testCaseAuditLog.previousValues,
      newValues: testCaseAuditLog.newValues,
      createdAt: testCaseAuditLog.createdAt,
      userName: users.name,
      userAvatar: users.avatar,
    })
    .from(testCaseAuditLog)
    .leftJoin(users, eq(testCaseAuditLog.userId, users.id))
    .where(eq(testCaseAuditLog.testCaseId, testCaseId))
    .orderBy(testCaseAuditLog.createdAt);

  return logs;
}

// Bulk actions

export async function bulkDeleteTestCases(ids: number[]) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;
  const userId = session.user.id;

  try {
    // Collect all data for undo BEFORE deleting
    const undoTestCases: Array<{
      testCase: {
        id: number;
        legacyId: string | null;
        title: string;
        folderId: number | null;
        order: number;
        template: string;
        state: string;
        priority: string;
        createdAt: number;
        updatedAt: number;
      };
      scenarios: Array<{
        id: number;
        title: string;
        gherkin: string;
        order: number;
        createdAt: number;
        updatedAt: number;
      }>;
    }> = [];

    for (const id of ids) {
      const existing = await db
        .select()
        .from(testCases)
        .where(
          and(
            eq(testCases.id, id),
            eq(testCases.organizationId, organizationId)
          )
        )
        .get();

      if (existing) {
        const existingScenarios = await db
          .select()
          .from(scenarios)
          .where(eq(scenarios.testCaseId, id));

        undoTestCases.push({
          testCase: {
            id: existing.id,
            legacyId: existing.legacyId,
            title: existing.title,
            folderId: existing.folderId,
            order: existing.order,
            template: existing.template,
            state: existing.state,
            priority: existing.priority,
            createdAt: existing.createdAt.getTime(),
            updatedAt: existing.updatedAt.getTime(),
          },
          scenarios: existingScenarios.map((s) => ({
            id: s.id,
            title: s.title,
            gherkin: s.gherkin,
            order: s.order,
            createdAt: s.createdAt.getTime(),
            updatedAt: s.updatedAt.getTime(),
          })),
        });

        await db.insert(testCaseAuditLog).values({
          testCaseId: id,
          userId,
          action: "deleted",
          changes: JSON.stringify([]),
          previousValues: JSON.stringify({
            title: existing.title,
            folderId: existing.folderId,
            state: existing.state,
          }),
          newValues: null,
        });

        await db
          .delete(testCases)
          .where(
            and(
              eq(testCases.id, id),
              eq(testCases.organizationId, organizationId)
            )
          );
      }
    }

    // Record undo for bulk delete
    if (undoTestCases.length > 0) {
      await recordUndo(
        "bulk_delete_test_cases",
        `Delete ${undoTestCases.length} test case(s)`,
        { testCases: undoTestCases }
      );
    }

    revalidatePath("/cases");
    return { success: true, count: ids.length };
  } catch (error) {
    console.error("Failed to delete test cases:", error);
    return { error: "Failed to delete test cases" };
  }
}

export async function bulkUpdateTestCaseState(
  ids: number[],
  state: "active" | "draft" | "upcoming" | "retired" | "rejected"
) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;
  const userId = session.user.id;

  try {
    const undoUpdates: Array<{
      testCaseId: number;
      previousValues: Record<string, unknown>;
    }> = [];

    for (const id of ids) {
      const existing = await db
        .select()
        .from(testCases)
        .where(
          and(
            eq(testCases.id, id),
            eq(testCases.organizationId, organizationId)
          )
        )
        .get();

      if (existing && existing.state !== state) {
        const oldValues = { state: existing.state };
        const newValues = { state };
        const changes = computeDiff(oldValues, newValues);

        undoUpdates.push({
          testCaseId: id,
          previousValues: { state: existing.state },
        });

        await db
          .update(testCases)
          .set({
            state,
            updatedAt: new Date(),
            updatedBy: userId,
          })
          .where(
            and(
              eq(testCases.id, id),
              eq(testCases.organizationId, organizationId)
            )
          );

        if (changes.length > 0) {
          await db.insert(testCaseAuditLog).values({
            testCaseId: id,
            userId,
            action: "updated",
            changes: JSON.stringify(changes),
            previousValues: JSON.stringify(oldValues),
            newValues: JSON.stringify(newValues),
          });
        }
      }
    }

    // Record undo for bulk state update
    if (undoUpdates.length > 0) {
      await recordUndo(
        "bulk_update_test_cases",
        `Change state to "${state}" for ${undoUpdates.length} test case(s)`,
        { updates: undoUpdates }
      );
    }

    revalidatePath("/cases");
    return { success: true, count: ids.length };
  } catch (error) {
    console.error("Failed to update test case states:", error);
    return { error: "Failed to update test case states" };
  }
}

export async function bulkMoveTestCasesToFolder(
  ids: number[],
  folderId: number | null
) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;
  const userId = session.user.id;

  try {
    const undoUpdates: Array<{
      testCaseId: number;
      previousValues: Record<string, unknown>;
    }> = [];

    for (const id of ids) {
      const existing = await db
        .select()
        .from(testCases)
        .where(
          and(
            eq(testCases.id, id),
            eq(testCases.organizationId, organizationId)
          )
        )
        .get();

      if (existing && existing.folderId !== folderId) {
        const oldValues = { folderId: existing.folderId };
        const newValues = { folderId };
        const changes = computeDiff(oldValues, newValues);

        undoUpdates.push({
          testCaseId: id,
          previousValues: { folderId: existing.folderId },
        });

        await db
          .update(testCases)
          .set({
            folderId,
            updatedAt: new Date(),
            updatedBy: userId,
          })
          .where(
            and(
              eq(testCases.id, id),
              eq(testCases.organizationId, organizationId)
            )
          );

        if (changes.length > 0) {
          await db.insert(testCaseAuditLog).values({
            testCaseId: id,
            userId,
            action: "updated",
            changes: JSON.stringify(changes),
            previousValues: JSON.stringify(oldValues),
            newValues: JSON.stringify(newValues),
          });
        }
      }
    }

    // Record undo for bulk move
    if (undoUpdates.length > 0) {
      await recordUndo(
        "bulk_move_test_cases",
        `Move ${undoUpdates.length} test case(s) to folder`,
        { updates: undoUpdates }
      );
    }

    revalidatePath("/cases");
    return { success: true, count: ids.length };
  } catch (error) {
    console.error("Failed to move test cases:", error);
    return { error: "Failed to move test cases" };
  }
}

export async function reorderTestCases(
  folderId: number | null,
  orderedIds: number[]
) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Get current order for undo
    const previousOrder: Array<{ id: number; order: number }> = [];
    for (const id of orderedIds) {
      const existing = await db
        .select({ id: testCases.id, order: testCases.order })
        .from(testCases)
        .where(
          and(
            eq(testCases.id, id),
            eq(testCases.organizationId, organizationId)
          )
        )
        .get();
      if (existing) {
        previousOrder.push({ id: existing.id, order: existing.order });
      }
    }

    // Apply new order
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(testCases)
        .set({ order: i })
        .where(
          and(
            eq(testCases.id, orderedIds[i]),
            eq(testCases.organizationId, organizationId)
          )
        );
    }

    // Record undo
    await recordUndo("reorder_test_cases", "Reorder test cases", {
      previousOrder,
    });

    revalidatePath("/cases");
    return { success: true };
  } catch (error) {
    console.error("Failed to reorder test cases:", error);
    return { error: "Failed to reorder test cases" };
  }
}
