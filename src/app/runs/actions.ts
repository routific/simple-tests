"use server";

import { db } from "@/lib/db";
import { testRuns, testRunResults, releases } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";
import { createIssueAttachment, deleteAttachmentByUrl } from "@/lib/linear";

interface CreateRunInput {
  name: string;
  releaseId: number | null;
  releaseName: string | null;
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
        releaseId: input.releaseId,
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

    // Create attachment on Linear issue if one is linked
    if (input.linearIssueId) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://simple-tests.routific.com";
      const runUrl = `${baseUrl}/runs/${runId}`;
      const titleParts = ["Test Run"];
      if (input.releaseName) {
        titleParts.push(`[${input.releaseName}]`);
      }
      titleParts.push(input.name);

      await createIssueAttachment({
        issueId: input.linearIssueId,
        title: titleParts.join(" "),
        url: runUrl,
        subtitle: `${input.scenarioIds.length} test case${input.scenarioIds.length !== 1 ? "s" : ""}`,
      });
    }

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

interface UpdateRunInput {
  runId: number;
  name?: string;
  releaseId?: number | null;
  linearProjectId?: string | null;
  linearProjectName?: string | null;
  linearMilestoneId?: string | null;
  linearMilestoneName?: string | null;
  linearIssueId?: string | null;
  linearIssueIdentifier?: string | null;
  linearIssueTitle?: string | null;
}

export async function updateTestRun(input: UpdateRunInput) {
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
        and(eq(testRuns.id, input.runId), eq(testRuns.organizationId, organizationId))
      )
      .get();

    if (!run) {
      return { error: "Test run not found" };
    }

    const updates: Partial<typeof testRuns.$inferInsert> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.releaseId !== undefined) updates.releaseId = input.releaseId;
    if (input.linearProjectId !== undefined) updates.linearProjectId = input.linearProjectId;
    if (input.linearProjectName !== undefined) updates.linearProjectName = input.linearProjectName;
    if (input.linearMilestoneId !== undefined) updates.linearMilestoneId = input.linearMilestoneId;
    if (input.linearMilestoneName !== undefined) updates.linearMilestoneName = input.linearMilestoneName;
    if (input.linearIssueId !== undefined) updates.linearIssueId = input.linearIssueId;
    if (input.linearIssueIdentifier !== undefined) updates.linearIssueIdentifier = input.linearIssueIdentifier;
    if (input.linearIssueTitle !== undefined) updates.linearIssueTitle = input.linearIssueTitle;

    await db
      .update(testRuns)
      .set(updates)
      .where(eq(testRuns.id, input.runId));

    // Handle Linear attachment changes if the issue changed
    const oldIssueId = run.linearIssueId;
    const newIssueId = input.linearIssueId;
    const issueChanged = input.linearIssueId !== undefined && oldIssueId !== newIssueId;

    if (issueChanged) {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://simple-tests.routific.com";
      const runUrl = `${baseUrl}/runs/${input.runId}`;

      // Delete attachment from old issue if there was one
      if (oldIssueId) {
        await deleteAttachmentByUrl(runUrl);
      }

      // Create attachment on new issue if there is one
      if (newIssueId) {
        // Get scenario count for subtitle
        const results = await db
          .select()
          .from(testRunResults)
          .where(eq(testRunResults.testRunId, input.runId));

        const scenarioCount = results.length;
        const runName = input.name ?? run.name;

        // Get release name for title (use updated value if provided, otherwise fetch from db)
        let releaseName: string | null = null;
        const releaseId = input.releaseId !== undefined ? input.releaseId : run.releaseId;
        if (releaseId) {
          const release = await db
            .select({ name: releases.name })
            .from(releases)
            .where(eq(releases.id, releaseId))
            .get();
          releaseName = release?.name ?? null;
        }

        const titleParts = ["Test Run"];
        if (releaseName) {
          titleParts.push(`[${releaseName}]`);
        }
        titleParts.push(runName);

        await createIssueAttachment({
          issueId: newIssueId,
          title: titleParts.join(" "),
          url: runUrl,
          subtitle: `${scenarioCount} test case${scenarioCount !== 1 ? "s" : ""}`,
        });
      }
    }

    revalidatePath("/runs");
    revalidatePath(`/runs/${input.runId}`);

    return { success: true };
  } catch (error) {
    console.error("Failed to update test run:", error);
    return { error: "Failed to update test run" };
  }
}

interface AddScenariosInput {
  runId: number;
  scenarioIds: number[];
}

export async function addScenariosToRun(input: AddScenariosInput) {
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
        and(eq(testRuns.id, input.runId), eq(testRuns.organizationId, organizationId))
      )
      .get();

    if (!run) {
      return { error: "Test run not found" };
    }

    // Get existing scenario IDs in this run
    const existing = await db
      .select({ scenarioId: testRunResults.scenarioId })
      .from(testRunResults)
      .where(eq(testRunResults.testRunId, input.runId));

    const existingIds = new Set(existing.map((e) => e.scenarioId));

    // Only add scenarios that aren't already in the run
    const newScenarioIds = input.scenarioIds.filter((id) => !existingIds.has(id));

    if (newScenarioIds.length > 0) {
      await db.insert(testRunResults).values(
        newScenarioIds.map((scenarioId) => ({
          testRunId: input.runId,
          scenarioId,
          status: "pending" as const,
        }))
      );
    }

    revalidatePath("/runs");
    revalidatePath(`/runs/${input.runId}`);

    return { success: true, added: newScenarioIds.length };
  } catch (error) {
    console.error("Failed to add scenarios to run:", error);
    return { error: "Failed to add scenarios to run" };
  }
}

interface RemoveScenariosInput {
  runId: number;
  resultIds: number[];
}

export async function removeScenariosFromRun(input: RemoveScenariosInput) {
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
        and(eq(testRuns.id, input.runId), eq(testRuns.organizationId, organizationId))
      )
      .get();

    if (!run) {
      return { error: "Test run not found" };
    }

    // Delete the specified results
    for (const resultId of input.resultIds) {
      await db
        .delete(testRunResults)
        .where(
          and(
            eq(testRunResults.id, resultId),
            eq(testRunResults.testRunId, input.runId)
          )
        );
    }

    revalidatePath("/runs");
    revalidatePath(`/runs/${input.runId}`);

    return { success: true, removed: input.resultIds.length };
  } catch (error) {
    console.error("Failed to remove scenarios from run:", error);
    return { error: "Failed to remove scenarios from run" };
  }
}
