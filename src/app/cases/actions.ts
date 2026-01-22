"use server";

import { db } from "@/lib/db";
import { testCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

interface SaveTestCaseInput {
  id?: number;
  title: string;
  gherkin: string;
  folderId: number | null;
  state: "active" | "draft" | "retired" | "rejected";
}

export async function saveTestCase(input: SaveTestCaseInput) {
  try {
    if (input.id) {
      // Update existing
      await db
        .update(testCases)
        .set({
          title: input.title,
          gherkin: input.gherkin,
          folderId: input.folderId,
          state: input.state,
          updatedAt: new Date(),
        })
        .where(eq(testCases.id, input.id));

      revalidatePath("/cases");
      revalidatePath(`/cases/${input.id}`);

      return { success: true, id: input.id };
    } else {
      // Create new
      const result = await db
        .insert(testCases)
        .values({
          title: input.title,
          gherkin: input.gherkin,
          folderId: input.folderId,
          state: input.state,
        })
        .returning({ id: testCases.id });

      revalidatePath("/cases");

      return { success: true, id: result[0].id };
    }
  } catch (error) {
    console.error("Failed to save test case:", error);
    return { error: "Failed to save test case" };
  }
}

export async function deleteTestCase(id: number) {
  try {
    await db.delete(testCases).where(eq(testCases.id, id));
    revalidatePath("/cases");
    return { success: true };
  } catch (error) {
    console.error("Failed to delete test case:", error);
    return { error: "Failed to delete test case" };
  }
}
