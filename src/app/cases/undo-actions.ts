"use server";

import { db } from "@/lib/db";
import { undoStack, testCases, scenarios } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";

// Types for undo data
interface UndoTestCaseCreate {
  testCaseId: number;
}

interface UndoTestCaseUpdate {
  testCaseId: number;
  previousValues: {
    title: string;
    folderId: number | null;
    state: string;
    priority: string;
    order: number;
  };
}

interface UndoTestCaseDelete {
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
}

interface UndoScenarioCreate {
  scenarioId: number;
  testCaseId: number;
}

interface UndoScenarioUpdate {
  scenarioId: number;
  testCaseId: number;
  previousValues: {
    title: string;
    gherkin: string;
    order: number;
  };
}

interface UndoScenarioDelete {
  testCaseId: number;
  scenario: {
    id: number;
    title: string;
    gherkin: string;
    order: number;
    createdAt: number;
    updatedAt: number;
  };
}

interface UndoBulkDelete {
  testCases: UndoTestCaseDelete[];
}

interface UndoBulkUpdate {
  updates: Array<{
    testCaseId: number;
    previousValues: Record<string, unknown>;
  }>;
}

interface UndoReorder {
  previousOrder: Array<{ id: number; order: number }>;
}

type UndoData =
  | UndoTestCaseCreate
  | UndoTestCaseUpdate
  | UndoTestCaseDelete
  | UndoScenarioCreate
  | UndoScenarioUpdate
  | UndoScenarioDelete
  | UndoBulkDelete
  | UndoBulkUpdate
  | UndoReorder;

// Record an undo action
export async function recordUndo(
  actionType: string,
  description: string,
  undoData: UndoData
) {
  const session = await getSessionWithOrg();
  if (!session) return;

  const { organizationId } = session.user;

  // Clear redo stack when a new action is recorded
  await db
    .delete(undoStack)
    .where(and(eq(undoStack.organizationId, organizationId), eq(undoStack.isRedo, true)));

  // Keep only the last 50 undo actions per organization
  const existingCount = await db
    .select({ id: undoStack.id })
    .from(undoStack)
    .where(and(eq(undoStack.organizationId, organizationId), eq(undoStack.isRedo, false)))
    .orderBy(desc(undoStack.createdAt))
    .limit(100);

  if (existingCount.length >= 50) {
    // Delete oldest entries beyond 50
    const idsToDelete = existingCount.slice(49).map((e) => e.id);
    for (const id of idsToDelete) {
      await db.delete(undoStack).where(eq(undoStack.id, id));
    }
  }

  await db.insert(undoStack).values({
    actionType: actionType as typeof undoStack.$inferInsert.actionType,
    description,
    undoData: JSON.stringify(undoData),
    isRedo: false,
    organizationId,
  });
}

// Get the last undo action
export async function getLastUndo(): Promise<{
  id: number;
  description: string;
  actionType: string;
} | null> {
  const session = await getSessionWithOrg();
  if (!session) return null;

  const { organizationId } = session.user;

  const lastUndo = await db
    .select({
      id: undoStack.id,
      description: undoStack.description,
      actionType: undoStack.actionType,
    })
    .from(undoStack)
    .where(and(eq(undoStack.organizationId, organizationId), eq(undoStack.isRedo, false)))
    .orderBy(desc(undoStack.createdAt))
    .limit(1);

  return lastUndo[0] || null;
}

// Get the last redo action
export async function getLastRedo(): Promise<{
  id: number;
  description: string;
  actionType: string;
} | null> {
  const session = await getSessionWithOrg();
  if (!session) return null;

  const { organizationId } = session.user;

  const lastRedo = await db
    .select({
      id: undoStack.id,
      description: undoStack.description,
      actionType: undoStack.actionType,
    })
    .from(undoStack)
    .where(and(eq(undoStack.organizationId, organizationId), eq(undoStack.isRedo, true)))
    .orderBy(desc(undoStack.createdAt))
    .limit(1);

  return lastRedo[0] || null;
}

// Get the undo stack for display
export async function getUndoStack(): Promise<Array<{
  id: number;
  description: string;
  actionType: string;
  createdAt: Date;
}>> {
  const session = await getSessionWithOrg();
  if (!session) return [];

  const { organizationId } = session.user;

  const stack = await db
    .select({
      id: undoStack.id,
      description: undoStack.description,
      actionType: undoStack.actionType,
      createdAt: undoStack.createdAt,
    })
    .from(undoStack)
    .where(and(eq(undoStack.organizationId, organizationId), eq(undoStack.isRedo, false)))
    .orderBy(desc(undoStack.createdAt))
    .limit(10);

  return stack;
}

// Get the redo stack for display
export async function getRedoStack(): Promise<Array<{
  id: number;
  description: string;
  actionType: string;
  createdAt: Date;
}>> {
  const session = await getSessionWithOrg();
  if (!session) return [];

  const { organizationId } = session.user;

  const stack = await db
    .select({
      id: undoStack.id,
      description: undoStack.description,
      actionType: undoStack.actionType,
      createdAt: undoStack.createdAt,
    })
    .from(undoStack)
    .where(and(eq(undoStack.organizationId, organizationId), eq(undoStack.isRedo, true)))
    .orderBy(desc(undoStack.createdAt))
    .limit(10);

  return stack;
}

// Execute undo
export async function executeUndo(): Promise<{ success?: boolean; error?: string; description?: string }> {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Get the last undo action
    const lastUndo = await db
      .select()
      .from(undoStack)
      .where(and(eq(undoStack.organizationId, organizationId), eq(undoStack.isRedo, false)))
      .orderBy(desc(undoStack.createdAt))
      .limit(1);

    if (lastUndo.length === 0) {
      return { error: "Nothing to undo" };
    }

    const undoEntry = lastUndo[0];
    const undoData = JSON.parse(undoEntry.undoData);
    let redoData: UndoData | null = null;

    // Execute the undo based on action type
    switch (undoEntry.actionType) {
      case "create_test_case": {
        // Undo create = delete, redo will need the test case data
        const data = undoData as UndoTestCaseCreate;

        // Get test case and scenarios for redo
        const testCase = await db.select().from(testCases).where(eq(testCases.id, data.testCaseId)).get();
        const testCaseScenarios = await db.select().from(scenarios).where(eq(scenarios.testCaseId, data.testCaseId));

        if (testCase) {
          redoData = {
            testCase: {
              id: testCase.id,
              legacyId: testCase.legacyId,
              title: testCase.title,
              folderId: testCase.folderId,
              order: testCase.order,
              template: testCase.template,
              state: testCase.state,
              priority: testCase.priority,
              createdAt: testCase.createdAt.getTime(),
              updatedAt: testCase.updatedAt.getTime(),
            },
            scenarios: testCaseScenarios.map(s => ({
              id: s.id,
              title: s.title,
              gherkin: s.gherkin,
              order: s.order,
              createdAt: s.createdAt.getTime(),
              updatedAt: s.updatedAt.getTime(),
            })),
          } as UndoTestCaseDelete;
        }

        await db.delete(scenarios).where(eq(scenarios.testCaseId, data.testCaseId));
        await db.delete(testCases).where(eq(testCases.id, data.testCaseId));
        break;
      }

      case "update_test_case": {
        // Undo update = restore previous values, redo will need current values
        const data = undoData as UndoTestCaseUpdate;

        // Get current values for redo
        const current = await db.select().from(testCases).where(eq(testCases.id, data.testCaseId)).get();
        if (current) {
          redoData = {
            testCaseId: data.testCaseId,
            previousValues: {
              title: current.title,
              folderId: current.folderId,
              state: current.state,
              priority: current.priority,
              order: current.order,
            },
          } as UndoTestCaseUpdate;
        }

        await db
          .update(testCases)
          .set({
            title: data.previousValues.title,
            folderId: data.previousValues.folderId,
            state: data.previousValues.state as "active" | "draft" | "retired" | "rejected",
            priority: data.previousValues.priority as "normal" | "high" | "critical",
            order: data.previousValues.order,
          })
          .where(eq(testCases.id, data.testCaseId));
        break;
      }

      case "delete_test_case": {
        // Undo delete = recreate, redo will just need the ID
        const data = undoData as UndoTestCaseDelete;
        redoData = { testCaseId: data.testCase.id } as UndoTestCaseCreate;

        // Recreate test case
        await db.insert(testCases).values({
          id: data.testCase.id,
          legacyId: data.testCase.legacyId,
          title: data.testCase.title,
          folderId: data.testCase.folderId,
          order: data.testCase.order,
          template: data.testCase.template as "bdd_feature" | "steps" | "text",
          state: data.testCase.state as "active" | "draft" | "retired" | "rejected",
          priority: data.testCase.priority as "normal" | "high" | "critical",
          organizationId,
          createdAt: new Date(data.testCase.createdAt),
          updatedAt: new Date(data.testCase.updatedAt),
        });

        // Recreate scenarios
        for (const scenario of data.scenarios) {
          await db.insert(scenarios).values({
            id: scenario.id,
            testCaseId: data.testCase.id,
            title: scenario.title,
            gherkin: scenario.gherkin,
            order: scenario.order,
            createdAt: new Date(scenario.createdAt),
            updatedAt: new Date(scenario.updatedAt),
          });
        }
        break;
      }

      case "create_scenario": {
        // Undo create = delete
        const data = undoData as UndoScenarioCreate;

        // Get scenario data for redo
        const scenario = await db.select().from(scenarios).where(eq(scenarios.id, data.scenarioId)).get();
        if (scenario) {
          redoData = {
            testCaseId: data.testCaseId,
            scenario: {
              id: scenario.id,
              title: scenario.title,
              gherkin: scenario.gherkin,
              order: scenario.order,
              createdAt: scenario.createdAt.getTime(),
              updatedAt: scenario.updatedAt.getTime(),
            },
          } as UndoScenarioDelete;
        }

        await db.delete(scenarios).where(eq(scenarios.id, data.scenarioId));
        break;
      }

      case "update_scenario": {
        // Undo update = restore previous values
        const data = undoData as UndoScenarioUpdate;

        // Get current values for redo
        const current = await db.select().from(scenarios).where(eq(scenarios.id, data.scenarioId)).get();
        if (current) {
          redoData = {
            scenarioId: data.scenarioId,
            testCaseId: data.testCaseId,
            previousValues: {
              title: current.title,
              gherkin: current.gherkin,
              order: current.order,
            },
          } as UndoScenarioUpdate;
        }

        await db
          .update(scenarios)
          .set({
            title: data.previousValues.title,
            gherkin: data.previousValues.gherkin,
            order: data.previousValues.order,
          })
          .where(eq(scenarios.id, data.scenarioId));
        break;
      }

      case "delete_scenario": {
        // Undo delete = recreate scenario
        const data = undoData as UndoScenarioDelete;
        redoData = { scenarioId: data.scenario.id, testCaseId: data.testCaseId } as UndoScenarioCreate;

        await db.insert(scenarios).values({
          id: data.scenario.id,
          testCaseId: data.testCaseId,
          title: data.scenario.title,
          gherkin: data.scenario.gherkin,
          order: data.scenario.order,
          createdAt: new Date(data.scenario.createdAt),
          updatedAt: new Date(data.scenario.updatedAt),
        });
        break;
      }

      case "bulk_delete_test_cases": {
        // Undo bulk delete = recreate all
        const data = undoData as UndoBulkDelete;
        const redoIds: number[] = [];

        for (const item of data.testCases) {
          redoIds.push(item.testCase.id);

          await db.insert(testCases).values({
            id: item.testCase.id,
            legacyId: item.testCase.legacyId,
            title: item.testCase.title,
            folderId: item.testCase.folderId,
            order: item.testCase.order,
            template: item.testCase.template as "bdd_feature" | "steps" | "text",
            state: item.testCase.state as "active" | "draft" | "retired" | "rejected",
            priority: item.testCase.priority as "normal" | "high" | "critical",
            organizationId,
            createdAt: new Date(item.testCase.createdAt),
            updatedAt: new Date(item.testCase.updatedAt),
          });

          for (const scenario of item.scenarios) {
            await db.insert(scenarios).values({
              id: scenario.id,
              testCaseId: item.testCase.id,
              title: scenario.title,
              gherkin: scenario.gherkin,
              order: scenario.order,
              createdAt: new Date(scenario.createdAt),
              updatedAt: new Date(scenario.updatedAt),
            });
          }
        }

        // For redo, we'll store the full data to delete again
        redoData = data;
        break;
      }

      case "bulk_update_test_cases": {
        // Undo bulk update = restore previous values
        const data = undoData as UndoBulkUpdate;
        const redoUpdates: Array<{ testCaseId: number; previousValues: Record<string, unknown> }> = [];

        for (const update of data.updates) {
          // Get current values for redo
          const current = await db.select().from(testCases).where(eq(testCases.id, update.testCaseId)).get();
          if (current) {
            const currentValues: Record<string, unknown> = {};
            for (const key of Object.keys(update.previousValues)) {
              currentValues[key] = (current as Record<string, unknown>)[key];
            }
            redoUpdates.push({ testCaseId: update.testCaseId, previousValues: currentValues });
          }

          await db
            .update(testCases)
            .set(update.previousValues as Record<string, unknown>)
            .where(eq(testCases.id, update.testCaseId));
        }

        redoData = { updates: redoUpdates } as UndoBulkUpdate;
        break;
      }

      case "bulk_move_test_cases": {
        // Undo bulk move = restore previous folder values (same logic as bulk_update)
        const data = undoData as UndoBulkUpdate;
        const redoUpdates: Array<{ testCaseId: number; previousValues: Record<string, unknown> }> = [];

        for (const update of data.updates) {
          const current = await db.select().from(testCases).where(eq(testCases.id, update.testCaseId)).get();
          if (current) {
            const currentValues: Record<string, unknown> = {};
            for (const key of Object.keys(update.previousValues)) {
              currentValues[key] = (current as Record<string, unknown>)[key];
            }
            redoUpdates.push({ testCaseId: update.testCaseId, previousValues: currentValues });
          }

          await db
            .update(testCases)
            .set(update.previousValues as Record<string, unknown>)
            .where(eq(testCases.id, update.testCaseId));
        }

        redoData = { updates: redoUpdates } as UndoBulkUpdate;
        break;
      }

      case "reorder_test_cases": {
        // Undo reorder = restore previous order
        const data = undoData as UndoReorder;
        const currentOrder: Array<{ id: number; order: number }> = [];

        for (const item of data.previousOrder) {
          // Get current order for redo
          const current = await db.select({ id: testCases.id, order: testCases.order }).from(testCases).where(eq(testCases.id, item.id)).get();
          if (current) {
            currentOrder.push({ id: current.id, order: current.order });
          }

          await db
            .update(testCases)
            .set({ order: item.order })
            .where(eq(testCases.id, item.id));
        }

        redoData = { previousOrder: currentOrder } as UndoReorder;
        break;
      }

      default:
        return { error: `Unknown action type: ${undoEntry.actionType}` };
    }

    // Move the undo entry to redo stack (keep same action type - the data tells us what to do)
    if (redoData) {
      await db.insert(undoStack).values({
        actionType: undoEntry.actionType,
        description: undoEntry.description,
        undoData: JSON.stringify(redoData),
        isRedo: true,
        organizationId,
      });
    }

    // Delete the undo entry
    await db.delete(undoStack).where(eq(undoStack.id, undoEntry.id));

    revalidatePath("/cases");
    revalidatePath("/");

    return { success: true, description: undoEntry.description };
  } catch (error) {
    console.error("Failed to execute undo:", error);
    return { error: "Failed to undo action" };
  }
}

// Execute redo
export async function executeRedo(): Promise<{ success?: boolean; error?: string; description?: string }> {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Get the last redo action
    const lastRedo = await db
      .select()
      .from(undoStack)
      .where(and(eq(undoStack.organizationId, organizationId), eq(undoStack.isRedo, true)))
      .orderBy(desc(undoStack.createdAt))
      .limit(1);

    if (lastRedo.length === 0) {
      return { error: "Nothing to redo" };
    }

    const redoEntry = lastRedo[0];
    const redoData = JSON.parse(redoEntry.undoData);
    let undoData: UndoData | null = null;

    // Execute the redo based on action type (redo is essentially the same as the original action)
    switch (redoEntry.actionType) {
      case "delete_test_case": {
        // Redo delete = delete again
        const data = redoData as UndoTestCaseDelete;
        undoData = data; // Store for undo

        await db.delete(scenarios).where(eq(scenarios.testCaseId, data.testCase.id));
        await db.delete(testCases).where(eq(testCases.id, data.testCase.id));
        break;
      }

      case "update_test_case": {
        // Redo update = apply the values again
        const data = redoData as UndoTestCaseUpdate;

        // Get current values for undo
        const current = await db.select().from(testCases).where(eq(testCases.id, data.testCaseId)).get();
        if (current) {
          undoData = {
            testCaseId: data.testCaseId,
            previousValues: {
              title: current.title,
              folderId: current.folderId,
              state: current.state,
              priority: current.priority,
              order: current.order,
            },
          } as UndoTestCaseUpdate;
        }

        await db
          .update(testCases)
          .set({
            title: data.previousValues.title,
            folderId: data.previousValues.folderId,
            state: data.previousValues.state as "active" | "draft" | "retired" | "rejected",
            priority: data.previousValues.priority as "normal" | "high" | "critical",
            order: data.previousValues.order,
          })
          .where(eq(testCases.id, data.testCaseId));
        break;
      }

      case "create_test_case": {
        // Redo create = recreate
        const data = redoData as UndoTestCaseDelete;
        undoData = { testCaseId: data.testCase.id } as UndoTestCaseCreate;

        await db.insert(testCases).values({
          id: data.testCase.id,
          legacyId: data.testCase.legacyId,
          title: data.testCase.title,
          folderId: data.testCase.folderId,
          order: data.testCase.order,
          template: data.testCase.template as "bdd_feature" | "steps" | "text",
          state: data.testCase.state as "active" | "draft" | "retired" | "rejected",
          priority: data.testCase.priority as "normal" | "high" | "critical",
          organizationId,
          createdAt: new Date(data.testCase.createdAt),
          updatedAt: new Date(data.testCase.updatedAt),
        });

        for (const scenario of data.scenarios) {
          await db.insert(scenarios).values({
            id: scenario.id,
            testCaseId: data.testCase.id,
            title: scenario.title,
            gherkin: scenario.gherkin,
            order: scenario.order,
            createdAt: new Date(scenario.createdAt),
            updatedAt: new Date(scenario.updatedAt),
          });
        }
        break;
      }

      case "delete_scenario": {
        // Redo delete = delete again
        const data = redoData as UndoScenarioDelete;
        undoData = data;
        await db.delete(scenarios).where(eq(scenarios.id, data.scenario.id));
        break;
      }

      case "update_scenario": {
        // Redo update = apply values
        const data = redoData as UndoScenarioUpdate;

        const current = await db.select().from(scenarios).where(eq(scenarios.id, data.scenarioId)).get();
        if (current) {
          undoData = {
            scenarioId: data.scenarioId,
            testCaseId: data.testCaseId,
            previousValues: {
              title: current.title,
              gherkin: current.gherkin,
              order: current.order,
            },
          } as UndoScenarioUpdate;
        }

        await db
          .update(scenarios)
          .set({
            title: data.previousValues.title,
            gherkin: data.previousValues.gherkin,
            order: data.previousValues.order,
          })
          .where(eq(scenarios.id, data.scenarioId));
        break;
      }

      case "create_scenario": {
        // Redo create = recreate
        const data = redoData as UndoScenarioDelete;
        undoData = { scenarioId: data.scenario.id, testCaseId: data.testCaseId } as UndoScenarioCreate;

        await db.insert(scenarios).values({
          id: data.scenario.id,
          testCaseId: data.testCaseId,
          title: data.scenario.title,
          gherkin: data.scenario.gherkin,
          order: data.scenario.order,
          createdAt: new Date(data.scenario.createdAt),
          updatedAt: new Date(data.scenario.updatedAt),
        });
        break;
      }

      case "bulk_delete_test_cases": {
        // Redo bulk delete
        const data = redoData as UndoBulkDelete;
        undoData = data;

        for (const item of data.testCases) {
          await db.delete(scenarios).where(eq(scenarios.testCaseId, item.testCase.id));
          await db.delete(testCases).where(eq(testCases.id, item.testCase.id));
        }
        break;
      }

      case "bulk_update_test_cases": {
        // Redo bulk update
        const data = redoData as UndoBulkUpdate;
        const undoUpdates: Array<{ testCaseId: number; previousValues: Record<string, unknown> }> = [];

        for (const update of data.updates) {
          const current = await db.select().from(testCases).where(eq(testCases.id, update.testCaseId)).get();
          if (current) {
            const currentValues: Record<string, unknown> = {};
            for (const key of Object.keys(update.previousValues)) {
              currentValues[key] = (current as Record<string, unknown>)[key];
            }
            undoUpdates.push({ testCaseId: update.testCaseId, previousValues: currentValues });
          }

          await db
            .update(testCases)
            .set(update.previousValues as Record<string, unknown>)
            .where(eq(testCases.id, update.testCaseId));
        }

        undoData = { updates: undoUpdates } as UndoBulkUpdate;
        break;
      }

      case "bulk_move_test_cases": {
        // Redo bulk move (same logic as bulk_update)
        const data = redoData as UndoBulkUpdate;
        const undoUpdates: Array<{ testCaseId: number; previousValues: Record<string, unknown> }> = [];

        for (const update of data.updates) {
          const current = await db.select().from(testCases).where(eq(testCases.id, update.testCaseId)).get();
          if (current) {
            const currentValues: Record<string, unknown> = {};
            for (const key of Object.keys(update.previousValues)) {
              currentValues[key] = (current as Record<string, unknown>)[key];
            }
            undoUpdates.push({ testCaseId: update.testCaseId, previousValues: currentValues });
          }

          await db
            .update(testCases)
            .set(update.previousValues as Record<string, unknown>)
            .where(eq(testCases.id, update.testCaseId));
        }

        undoData = { updates: undoUpdates } as UndoBulkUpdate;
        break;
      }

      case "reorder_test_cases": {
        // Redo reorder
        const data = redoData as UndoReorder;
        const currentOrder: Array<{ id: number; order: number }> = [];

        for (const item of data.previousOrder) {
          const current = await db.select({ id: testCases.id, order: testCases.order }).from(testCases).where(eq(testCases.id, item.id)).get();
          if (current) {
            currentOrder.push({ id: current.id, order: current.order });
          }

          await db
            .update(testCases)
            .set({ order: item.order })
            .where(eq(testCases.id, item.id));
        }

        undoData = { previousOrder: currentOrder } as UndoReorder;
        break;
      }

      default:
        return { error: `Unknown action type: ${redoEntry.actionType}` };
    }

    // Move back to undo stack (keep same action type - the data tells us what to do)
    if (undoData) {
      await db.insert(undoStack).values({
        actionType: redoEntry.actionType,
        description: redoEntry.description,
        undoData: JSON.stringify(undoData),
        isRedo: false,
        organizationId,
      });
    }

    // Delete the redo entry
    await db.delete(undoStack).where(eq(undoStack.id, redoEntry.id));

    revalidatePath("/cases");
    revalidatePath("/");

    return { success: true, description: redoEntry.description };
  } catch (error) {
    console.error("Failed to execute redo:", error);
    return { error: "Failed to redo action" };
  }
}

// Clear all undo history for the organization
export async function clearUndoHistory(): Promise<{ success?: boolean; error?: string }> {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    await db.delete(undoStack).where(eq(undoStack.organizationId, organizationId));
    return { success: true };
  } catch (error) {
    console.error("Failed to clear undo history:", error);
    return { error: "Failed to clear undo history" };
  }
}
