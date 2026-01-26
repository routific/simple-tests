"use server";

import { db } from "@/lib/db";
import { releases, testRuns } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";

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
