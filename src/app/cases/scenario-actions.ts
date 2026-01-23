"use server";

import { db } from "@/lib/db";
import { scenarios, testCases } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";
import { recordUndo } from "./undo-actions";

interface SaveScenarioInput {
  id?: number;
  testCaseId: number;
  title: string;
  gherkin: string;
  order?: number;
}

export async function saveScenario(input: SaveScenarioInput) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Verify the test case belongs to the organization
    const testCase = await db
      .select()
      .from(testCases)
      .where(
        and(
          eq(testCases.id, input.testCaseId),
          eq(testCases.organizationId, organizationId)
        )
      )
      .get();

    if (!testCase) {
      return { error: "Test case not found" };
    }

    if (input.id) {
      // Get existing scenario for undo
      const existing = await db
        .select()
        .from(scenarios)
        .where(eq(scenarios.id, input.id))
        .get();

      if (existing) {
        // Record undo for update
        await recordUndo("update_scenario", `Update scenario "${input.title}"`, {
          scenarioId: input.id,
          testCaseId: input.testCaseId,
          previousValues: {
            title: existing.title,
            gherkin: existing.gherkin,
            order: existing.order,
          },
        });
      }

      // Update existing scenario
      await db
        .update(scenarios)
        .set({
          title: input.title,
          gherkin: input.gherkin,
          order: input.order ?? 0,
          updatedAt: new Date(),
        })
        .where(eq(scenarios.id, input.id));

      revalidatePath("/cases");
      return { success: true, id: input.id };
    } else {
      // Get max order for this test case
      const maxOrder = await db
        .select({ maxOrder: sql<number>`MAX(${scenarios.order})` })
        .from(scenarios)
        .where(eq(scenarios.testCaseId, input.testCaseId))
        .get();

      const newOrder = input.order ?? (maxOrder?.maxOrder ?? -1) + 1;

      // Create new scenario
      const result = await db
        .insert(scenarios)
        .values({
          testCaseId: input.testCaseId,
          title: input.title,
          gherkin: input.gherkin,
          order: newOrder,
        })
        .returning({ id: scenarios.id });

      // Record undo for create
      await recordUndo("create_scenario", `Create scenario "${input.title}"`, {
        scenarioId: result[0].id,
        testCaseId: input.testCaseId,
      });

      revalidatePath("/cases");
      return { success: true, id: result[0].id };
    }
  } catch (error) {
    console.error("Failed to save scenario:", error);
    return { error: "Failed to save scenario" };
  }
}

export async function deleteScenario(id: number) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Get full scenario data for undo
    const scenarioData = await db
      .select()
      .from(scenarios)
      .where(eq(scenarios.id, id))
      .get();

    // Verify scenario belongs to a test case in the organization
    const scenario = await db
      .select({
        id: scenarios.id,
        testCaseId: scenarios.testCaseId,
        organizationId: testCases.organizationId,
      })
      .from(scenarios)
      .innerJoin(testCases, eq(scenarios.testCaseId, testCases.id))
      .where(eq(scenarios.id, id))
      .get();

    if (!scenario || scenario.organizationId !== organizationId) {
      return { error: "Scenario not found" };
    }

    // Record undo BEFORE deleting
    if (scenarioData) {
      await recordUndo("delete_scenario", `Delete scenario "${scenarioData.title}"`, {
        testCaseId: scenario.testCaseId,
        scenario: {
          id: scenarioData.id,
          title: scenarioData.title,
          gherkin: scenarioData.gherkin,
          order: scenarioData.order,
          createdAt: scenarioData.createdAt.getTime(),
          updatedAt: scenarioData.updatedAt.getTime(),
        },
      });
    }

    await db.delete(scenarios).where(eq(scenarios.id, id));

    revalidatePath("/cases");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete scenario:", error);
    return { error: "Failed to delete scenario" };
  }
}

export async function reorderScenarios(testCaseId: number, scenarioIds: number[]) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Verify the test case belongs to the organization
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
      return { error: "Test case not found" };
    }

    // Update order for each scenario
    await Promise.all(
      scenarioIds.map((id, index) =>
        db
          .update(scenarios)
          .set({ order: index, updatedAt: new Date() })
          .where(and(eq(scenarios.id, id), eq(scenarios.testCaseId, testCaseId)))
      )
    );

    revalidatePath("/cases");
    return { success: true };
  } catch (error) {
    console.error("Failed to reorder scenarios:", error);
    return { error: "Failed to reorder scenarios" };
  }
}

export async function getScenarios(testCaseId: number) {
  const session = await getSessionWithOrg();
  if (!session) {
    return [];
  }

  const { organizationId } = session.user;

  // Verify the test case belongs to the organization
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

  const result = await db
    .select()
    .from(scenarios)
    .where(eq(scenarios.testCaseId, testCaseId))
    .orderBy(scenarios.order);

  return result;
}
