"use server";

import { db } from "@/lib/db";
import { testRuns, testRunResults } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

interface CreateRunInput {
  name: string;
  description: string | null;
  caseIds: number[];
}

export async function createTestRun(input: CreateRunInput) {
  try {
    const result = await db
      .insert(testRuns)
      .values({
        name: input.name,
        description: input.description,
        status: "in_progress",
      })
      .returning({ id: testRuns.id });

    const runId = result[0].id;

    await db.insert(testRunResults).values(
      input.caseIds.map((caseId) => ({
        testRunId: runId,
        testCaseId: caseId,
        status: "pending" as const,
      }))
    );

    revalidatePath("/runs");
    revalidatePath("/");

    return { success: true, id: runId };
  } catch (error) {
    console.error("Failed to create test run:", error);
    return { error: "Failed to create test run" };
  }
}

interface UpdateResultInput {
  resultId: number;
  status: "pending" | "passed" | "failed" | "blocked" | "skipped";
  notes?: string;
}

export async function updateTestResult(input: UpdateResultInput) {
  try {
    await db
      .update(testRunResults)
      .set({
        status: input.status,
        notes: input.notes || null,
        executedAt: new Date(),
      })
      .where(eq(testRunResults.id, input.resultId));

    revalidatePath("/runs");

    return { success: true };
  } catch (error) {
    console.error("Failed to update test result:", error);
    return { error: "Failed to update test result" };
  }
}

export async function completeTestRun(runId: number) {
  try {
    await db
      .update(testRuns)
      .set({ status: "completed" })
      .where(eq(testRuns.id, runId));

    revalidatePath("/runs");
    revalidatePath(`/runs/${runId}`);
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Failed to complete test run:", error);
    return { error: "Failed to complete test run" };
  }
}

export async function deleteTestRun(runId: number) {
  try {
    await db.delete(testRunResults).where(eq(testRunResults.testRunId, runId));
    await db.delete(testRuns).where(eq(testRuns.id, runId));

    revalidatePath("/runs");
    revalidatePath("/");

    return { success: true };
  } catch (error) {
    console.error("Failed to delete test run:", error);
    return { error: "Failed to delete test run" };
  }
}
