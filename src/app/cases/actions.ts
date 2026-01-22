"use server";

import { db } from "@/lib/db";
import { testCases, testCaseAuditLog } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";

interface SaveTestCaseInput {
  id?: number;
  title: string;
  gherkin: string;
  folderId: number | null;
  state: "active" | "draft" | "retired" | "rejected";
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
        gherkin: existing.gherkin,
        folderId: existing.folderId,
        state: existing.state,
      };

      const newValues = {
        title: input.title,
        gherkin: input.gherkin,
        folderId: input.folderId,
        state: input.state,
      };

      const changes = computeDiff(oldValues, newValues);

      // Update existing
      await db
        .update(testCases)
        .set({
          title: input.title,
          gherkin: input.gherkin,
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
          gherkin: input.gherkin,
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
          gherkin: input.gherkin,
          folderId: input.folderId,
          state: input.state,
        }),
      });

      revalidatePath("/cases");

      return { success: true, id: newId };
    }
  } catch (error) {
    console.error("Failed to save test case:", error);
    return { error: "Failed to save test case" };
  }
}

export async function deleteTestCase(id: number) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;
  const userId = session.user.id;

  try {
    // Get current values for audit log
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

    // Create audit log entry for deletion
    await db.insert(testCaseAuditLog).values({
      testCaseId: id,
      userId,
      action: "deleted",
      changes: JSON.stringify([]),
      previousValues: JSON.stringify({
        title: existing.title,
        gherkin: existing.gherkin,
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
    .select()
    .from(testCaseAuditLog)
    .where(eq(testCaseAuditLog.testCaseId, testCaseId))
    .orderBy(testCaseAuditLog.createdAt);

  return logs;
}
