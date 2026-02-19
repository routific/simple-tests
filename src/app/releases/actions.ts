"use server";

import { db } from "@/lib/db";
import { releases, testRuns } from "@/lib/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";
import { getReleaseLabels, getIssuesByLabel, LinearAuthError } from "@/lib/linear";

interface CreateReleaseInput {
  name: string;
}

export async function createRelease(input: CreateReleaseInput) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;
  const userId = session.user.id;

  try {
    const result = await db
      .insert(releases)
      .values({
        name: input.name.trim(),
        organizationId,
        createdBy: userId,
        status: "active",
      })
      .returning({ id: releases.id, name: releases.name, status: releases.status });

    revalidatePath("/runs");
    revalidatePath("/runs/new");

    return { success: true, release: result[0] };
  } catch (error) {
    console.error("Failed to create release:", error);
    return { error: "Failed to create release" };
  }
}

export async function listReleases() {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized", releases: [] };
  }

  const { organizationId } = session.user;

  try {
    const result = await db
      .select()
      .from(releases)
      .where(eq(releases.organizationId, organizationId))
      .orderBy(releases.createdAt);

    return { releases: result };
  } catch (error) {
    console.error("Failed to list releases:", error);
    return { error: "Failed to list releases", releases: [] };
  }
}

export async function completeRelease(id: number) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    await db
      .update(releases)
      .set({ status: "completed" })
      .where(
        and(eq(releases.id, id), eq(releases.organizationId, organizationId))
      );

    revalidatePath("/runs");

    return { success: true };
  } catch (error) {
    console.error("Failed to complete release:", error);
    return { error: "Failed to complete release" };
  }
}

export async function reopenRelease(id: number) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    await db
      .update(releases)
      .set({ status: "active" })
      .where(
        and(eq(releases.id, id), eq(releases.organizationId, organizationId))
      );

    revalidatePath("/runs");

    return { success: true };
  } catch (error) {
    console.error("Failed to reopen release:", error);
    return { error: "Failed to reopen release" };
  }
}

export async function updateRelease(id: number, name: string) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    await db
      .update(releases)
      .set({ name: name.trim() })
      .where(
        and(eq(releases.id, id), eq(releases.organizationId, organizationId))
      );

    revalidatePath("/runs");

    return { success: true };
  } catch (error) {
    console.error("Failed to update release:", error);
    return { error: "Failed to update release" };
  }
}

export async function deleteRelease(id: number) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Orphan runs to Unassigned (set releaseId = NULL)
    await db
      .update(testRuns)
      .set({ releaseId: null })
      .where(eq(testRuns.releaseId, id));

    // Delete the release
    await db
      .delete(releases)
      .where(
        and(eq(releases.id, id), eq(releases.organizationId, organizationId))
      );

    revalidatePath("/runs");

    return { success: true };
  } catch (error) {
    console.error("Failed to delete release:", error);
    return { error: "Failed to delete release" };
  }
}

export async function syncReleasesFromLinear() {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  if (session.error === "RefreshTokenError" || session.error === "RefreshTokenMissing") {
    return { error: "auth_expired" };
  }

  const { organizationId } = session.user;
  const userId = session.user.id;

  try {
    const labels = await getReleaseLabels();

    if (labels.length === 0) {
      return { created: 0, updated: 0, message: "No labels found in the 'Release' label group in Linear." };
    }

    // Fetch existing releases for this org that have a linearLabelId
    const existingReleases = await db
      .select()
      .from(releases)
      .where(eq(releases.organizationId, organizationId));

    const existingByLabelId = new Map(
      existingReleases
        .filter((r) => r.linearLabelId)
        .map((r) => [r.linearLabelId!, r])
    );

    let created = 0;
    let updated = 0;

    for (const label of labels) {
      const existing = existingByLabelId.get(label.id);

      if (existing) {
        // Update name if changed
        if (existing.name !== label.name) {
          await db
            .update(releases)
            .set({ name: label.name })
            .where(eq(releases.id, existing.id));
          updated++;
        }
      } else {
        // Insert new release
        await db.insert(releases).values({
          name: label.name,
          organizationId,
          linearLabelId: label.id,
          createdBy: userId,
          status: "active",
        });
        created++;
      }
    }

    // Auto-associate test runs with releases based on linked Linear issues
    let runsAssociated = 0;

    // Get all releases with linearLabelId for this org
    const releasesWithLabels = await db
      .select({
        id: releases.id,
        linearLabelId: releases.linearLabelId,
      })
      .from(releases)
      .where(
        and(
          eq(releases.organizationId, organizationId),
          // Only process releases that have a Linear label
        )
      );

    for (const release of releasesWithLabels) {
      if (!release.linearLabelId) continue;

      try {
        // Fetch issues tagged with this release label
        const issues = await getIssuesByLabel(release.linearLabelId);

        if (issues.length === 0) continue;

        // Get all issue IDs
        const issueIds = issues.map(issue => issue.id);

        // Find test runs linked to these issues that don't have a release assigned
        // and belong to this organization
        const matchingRuns = await db
          .select({ id: testRuns.id })
          .from(testRuns)
          .where(
            and(
              eq(testRuns.organizationId, organizationId),
              inArray(testRuns.linearIssueId, issueIds),
              isNull(testRuns.releaseId)
            )
          );

        if (matchingRuns.length > 0) {
          // Update these test runs to associate with the release
          await db
            .update(testRuns)
            .set({ releaseId: release.id })
            .where(
              and(
                eq(testRuns.organizationId, organizationId),
                inArray(testRuns.linearIssueId, issueIds),
                isNull(testRuns.releaseId)
              )
            );

          runsAssociated += matchingRuns.length;
        }
      } catch (error) {
        // Log but don't fail the whole sync if one release's issue fetch fails
        console.error(`Failed to fetch issues for release ${release.id}:`, error);
      }
    }

    revalidatePath("/releases");
    revalidatePath("/runs");

    return { created, updated, runsAssociated };
  } catch (error) {
    if (error instanceof LinearAuthError) {
      return { error: "auth_expired" };
    }
    console.error("Failed to sync releases from Linear:", error);
    return { error: "Failed to sync releases from Linear" };
  }
}
