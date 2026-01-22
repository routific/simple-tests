"use server";

import { db } from "@/lib/db";
import { testRuns, testRunResults } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";

interface CreateRunInput {
  name: string;
  description: string | null;
  scenarioIds: number[];
  linearProjectId: string | null;
  linearProjectName: string | null;
  linearMilestoneId: string | null;
  linearMilestoneName: string | null;
  linearIssueId: string | null;
  linearIssueIdentifier: string | null;
  linearIssueTitle: string | null;
}

export async function createTestRun(input: CreateRunInput) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;
  const userId = session.user.id;

  try {
    const result = await db
      .insert(testRuns)
      .values({
        name: input.name,
        description: input.description,
        organizationId,
        createdBy: userId,
        status: "in_progress",
        linearProjectId: input.linearProjectId,
        linearProjectName: input.linearProjectName,
        linearMilestoneId: input.linearMilestoneId,
        linearMilestoneName: input.linearMilestoneName,
        linearIssueId: input.linearIssueId,
        linearIssueIdentifier: input.linearIssueIdentifier,
        linearIssueTitle: input.linearIssueTitle,
      })
      .returning({ id: testRuns.id });

    const runId = result[0].id;

    await db.insert(testRunResults).values(
      input.scenarioIds.map((scenarioId) => ({
        testRunId: runId,
        scenarioId,
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
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const userId = session.user.id;

  try {
    await db
      .update(testRunResults)
      .set({
        status: input.status,
        notes: input.notes || null,
        executedAt: new Date(),
        executedBy: userId,
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
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    await db
      .update(testRuns)
      .set({ status: "completed" })
      .where(
        and(eq(testRuns.id, runId), eq(testRuns.organizationId, organizationId))
      );

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
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Verify the run belongs to the organization
    const run = await db
      .select()
      .from(testRuns)
      .where(
        and(eq(testRuns.id, runId), eq(testRuns.organizationId, organizationId))
      )
      .get();

    if (!run) {
      return { error: "Test run not found" };
    }

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
