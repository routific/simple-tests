"use server";

import { db } from "@/lib/db";
import { releases, testRuns, type Release } from "@/lib/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";
import { getReleaseLabels, getCompletedReleaseLabels, getIssuesByLabels, LinearAuthError } from "@/lib/linear";
import { isDemoMode } from "@/lib/demo";

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
  if (isDemoMode()) {
    return { created: 0, updated: 0, message: "Linear sync is disabled in demo mode." };
  }

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
    const [labels, completedLabels] = await Promise.all([
      getReleaseLabels(),
      getCompletedReleaseLabels(),
    ]);

    if (labels.length === 0 && completedLabels.length === 0) {
      return { created: 0, updated: 0, message: "No labels found in the 'Release' or 'Completed Release' label groups in Linear." };
    }

    // Linear allows the same release name to exist as a separate label in each
    // team (and at workspace level), so a single logical release can show up as
    // several labels with distinct IDs. Group labels by name so each name maps
    // to ONE release that owns every matching label ID.
    type ReleaseGroup = { name: string; labelIds: Set<string>; status: "active" | "completed" };
    const groupsByName = new Map<string, ReleaseGroup>();

    const groupFor = (name: string): ReleaseGroup => {
      let g = groupsByName.get(name);
      if (!g) {
        g = { name, labelIds: new Set(), status: "active" };
        groupsByName.set(name, g);
      }
      return g;
    };

    for (const label of labels) {
      groupFor(label.name).labelIds.add(label.id);
    }
    // "Completed Release" group wins for status.
    for (const label of completedLabels) {
      const g = groupFor(label.name);
      g.labelIds.add(label.id);
      g.status = "completed";
    }

    // Fetch all existing releases for this org so we can match + merge duplicates.
    const existingReleases = await db
      .select()
      .from(releases)
      .where(eq(releases.organizationId, organizationId));

    const labelIdsOf = (r: Release): string[] => {
      const ids = new Set<string>();
      if (r.linearLabelId) ids.add(r.linearLabelId);
      if (r.linearLabelIds) {
        try {
          const parsed = JSON.parse(r.linearLabelIds);
          if (Array.isArray(parsed)) parsed.forEach((id) => typeof id === "string" && ids.add(id));
        } catch {
          // ignore malformed JSON
        }
      }
      return Array.from(ids);
    };

    let created = 0;
    let updated = 0;
    let completed = 0;
    let merged = 0;
    let runsAssociated = 0;

    // Track which existing releases have already been claimed by a group so a
    // single release can't be merged into two groups.
    const consumed = new Set<number>();

    for (const group of Array.from(groupsByName.values())) {
      const groupLabelIds = Array.from(group.labelIds);

      // Match existing synced releases either by an overlapping label ID or by
      // exact name. Manually-created releases (no Linear label) are left alone.
      const candidates = existingReleases.filter((r) => {
        if (consumed.has(r.id)) return false;
        const hasLabel = r.linearLabelId !== null || r.linearLabelIds !== null;
        if (!hasLabel) return false;
        const ids = labelIdsOf(r);
        const overlaps = ids.some((id) => group.labelIds.has(id));
        return overlaps || r.name === group.name;
      });
      candidates.forEach((c) => consumed.add(c.id));

      // Keep the oldest (lowest id) as the canonical release.
      candidates.sort((a, b) => a.id - b.id);
      const keeper = candidates[0];
      const duplicates = candidates.slice(1);

      // Canonical label ID: keep the keeper's current one if it's still valid,
      // otherwise the lowest sorted ID, for a stable URL slug.
      const sortedIds = groupLabelIds.slice().sort();
      const canonicalLabelId =
        keeper?.linearLabelId && group.labelIds.has(keeper.linearLabelId)
          ? keeper.linearLabelId
          : sortedIds[0];
      const labelIdsJson = JSON.stringify(sortedIds);

      // Issue count + auto-association only for active releases. Completed
      // releases rarely need it and skipping keeps sync within Linear's rate
      // limits (one query per active release name instead of per label).
      let issueCount: number | null = null;
      let issueIds: string[] = [];
      if (group.status === "active") {
        try {
          const issues = await getIssuesByLabels(groupLabelIds);
          issueCount = issues.length;
          issueIds = issues.map((i) => i.id);
        } catch (error) {
          if (error instanceof LinearAuthError) throw error;
          console.error(`Failed to fetch issues for release "${group.name}":`, error);
        }
      }

      if (keeper) {
        // Re-point any test runs from duplicates onto the keeper, then delete
        // the duplicate rows.
        for (const dup of duplicates) {
          await db
            .update(testRuns)
            .set({ releaseId: keeper.id })
            .where(
              and(
                eq(testRuns.organizationId, organizationId),
                eq(testRuns.releaseId, dup.id)
              )
            );
          await db.delete(releases).where(eq(releases.id, dup.id));
          merged++;
        }

        const updates: Partial<Release> = {
          name: group.name,
          linearLabelId: canonicalLabelId,
          linearLabelIds: labelIdsJson,
        };
        if (group.status === "active") updates.issueCount = issueCount;
        if (group.status === "completed" && keeper.status !== "completed") {
          updates.status = "completed";
          completed++;
        }
        if (keeper.name !== group.name) updated++;

        await db.update(releases).set(updates).where(eq(releases.id, keeper.id));
      } else {
        // No existing release for this name - create one.
        await db.insert(releases).values({
          name: group.name,
          organizationId,
          linearLabelId: canonicalLabelId,
          linearLabelIds: labelIdsJson,
          issueCount,
          createdBy: userId,
          status: group.status,
        });
        created++;
        if (group.status === "completed") completed++;
      }

      // Auto-associate unassigned test runs whose linked Linear issue is tagged
      // with this release.
      if (issueIds.length > 0) {
        const targetId =
          keeper?.id ??
          (
            await db
              .select({ id: releases.id })
              .from(releases)
              .where(
                and(
                  eq(releases.organizationId, organizationId),
                  eq(releases.linearLabelId, canonicalLabelId)
                )
              )
              .get()
          )?.id;

        if (targetId) {
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
            await db
              .update(testRuns)
              .set({ releaseId: targetId })
              .where(
                and(
                  eq(testRuns.organizationId, organizationId),
                  inArray(testRuns.linearIssueId, issueIds),
                  isNull(testRuns.releaseId)
                )
              );
            runsAssociated += matchingRuns.length;
          }
        }
      }
    }

    revalidatePath("/releases");
    revalidatePath("/runs");

    return { created, updated, completed, merged, runsAssociated };
  } catch (error) {
    if (error instanceof LinearAuthError) {
      return { error: "auth_expired" };
    }
    console.error("Failed to sync releases from Linear:", error);
    return { error: "Failed to sync releases from Linear" };
  }
}
