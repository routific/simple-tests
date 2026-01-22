"use server";

import { db } from "@/lib/db";
import { folders, testCases } from "@/lib/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";

export async function createFolder(input: {
  name: string;
  parentId: number | null;
}) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Get max order for siblings
    const siblings = await db
      .select({ maxOrder: sql<number>`MAX(${folders.order})` })
      .from(folders)
      .where(
        and(
          eq(folders.organizationId, organizationId),
          input.parentId
            ? eq(folders.parentId, input.parentId)
            : sql`${folders.parentId} IS NULL`
        )
      );

    const newOrder = (siblings[0]?.maxOrder ?? -1) + 1;

    const result = await db
      .insert(folders)
      .values({
        name: input.name,
        parentId: input.parentId,
        order: newOrder,
        organizationId,
      })
      .returning({ id: folders.id });

    revalidatePath("/cases");
    return { success: true, id: result[0].id };
  } catch (error) {
    console.error("Failed to create folder:", error);
    return { error: "Failed to create folder" };
  }
}

export async function renameFolder(id: number, name: string) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    await db
      .update(folders)
      .set({ name })
      .where(
        and(eq(folders.id, id), eq(folders.organizationId, organizationId))
      );
    revalidatePath("/cases");
    return { success: true };
  } catch (error) {
    console.error("Failed to rename folder:", error);
    return { error: "Failed to rename folder" };
  }
}

export async function deleteFolder(id: number) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Check for child folders
    const children = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(eq(folders.parentId, id), eq(folders.organizationId, organizationId))
      )
      .limit(1);

    if (children.length > 0) {
      return {
        error: "Cannot delete folder with subfolders. Delete subfolders first.",
      };
    }

    // Check for test cases in this folder
    const cases = await db
      .select({ id: testCases.id })
      .from(testCases)
      .where(
        and(
          eq(testCases.folderId, id),
          eq(testCases.organizationId, organizationId)
        )
      )
      .limit(1);

    if (cases.length > 0) {
      return {
        error:
          "Cannot delete folder with test cases. Move or delete test cases first.",
      };
    }

    await db
      .delete(folders)
      .where(
        and(eq(folders.id, id), eq(folders.organizationId, organizationId))
      );
    revalidatePath("/cases");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete folder:", error);
    return { error: "Failed to delete folder" };
  }
}

export async function moveFolder(
  id: number,
  newParentId: number | null,
  newOrder: number
) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Prevent circular references - can't move a folder into its own descendant
    if (newParentId !== null) {
      const isDescendant = await checkIsDescendant(id, newParentId, organizationId);
      if (isDescendant) {
        return { error: "Cannot move a folder into its own subfolder" };
      }
    }

    // Get current siblings at new location
    const siblings = await db
      .select({ id: folders.id, order: folders.order })
      .from(folders)
      .where(
        and(
          eq(folders.organizationId, organizationId),
          newParentId
            ? eq(folders.parentId, newParentId)
            : sql`${folders.parentId} IS NULL`
        )
      )
      .orderBy(folders.order);

    // Update orders to make room
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i];
      if (sibling.id === id) continue;
      const adjustedOrder = i >= newOrder ? i + 1 : i;
      if (sibling.order !== adjustedOrder) {
        await db
          .update(folders)
          .set({ order: adjustedOrder })
          .where(eq(folders.id, sibling.id));
      }
    }

    // Update the moved folder
    await db
      .update(folders)
      .set({ parentId: newParentId, order: newOrder })
      .where(
        and(eq(folders.id, id), eq(folders.organizationId, organizationId))
      );

    revalidatePath("/cases");
    return { success: true };
  } catch (error) {
    console.error("Failed to move folder:", error);
    return { error: "Failed to move folder" };
  }
}

async function checkIsDescendant(
  folderId: number,
  potentialDescendantId: number,
  organizationId: string
): Promise<boolean> {
  let currentId: number | null = potentialDescendantId;

  while (currentId !== null) {
    if (currentId === folderId) return true;

    const parent = await db
      .select({ parentId: folders.parentId })
      .from(folders)
      .where(
        and(
          eq(folders.id, currentId),
          eq(folders.organizationId, organizationId)
        )
      )
      .limit(1);

    currentId = parent[0]?.parentId ?? null;
  }

  return false;
}

export async function moveTestCaseToFolder(
  testCaseId: number,
  folderId: number | null
) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    await db
      .update(testCases)
      .set({ folderId, updatedAt: new Date() })
      .where(
        and(
          eq(testCases.id, testCaseId),
          eq(testCases.organizationId, organizationId)
        )
      );

    revalidatePath("/cases");
    return { success: true };
  } catch (error) {
    console.error("Failed to move test case:", error);
    return { error: "Failed to move test case" };
  }
}

export async function reorderFolders(
  parentId: number | null,
  orderedIds: number[]
) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(folders)
        .set({ order: i })
        .where(
          and(
            eq(folders.id, orderedIds[i]),
            eq(folders.organizationId, organizationId)
          )
        );
    }

    revalidatePath("/cases");
    return { success: true };
  } catch (error) {
    console.error("Failed to reorder folders:", error);
    return { error: "Failed to reorder folders" };
  }
}
