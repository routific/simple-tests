"use server";

import { db } from "@/lib/db";
import { releases, testRuns } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";
import { getReleaseLabels, LinearAuthError } from "@/lib/linear";

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
      return { created: 0, updated: 0, message: "No labels found in the 'Releases' label group in Linear." };
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

    revalidatePath("/releases");
    revalidatePath("/runs");

    return { created, updated };
  } catch (error) {
    if (error instanceof LinearAuthError) {
      return { error: "auth_expired" };
    }
    console.error("Failed to sync releases from Linear:", error);
    return { error: "Failed to sync releases from Linear" };
  }
}
