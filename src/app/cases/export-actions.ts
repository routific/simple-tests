"use server";

import { db } from "@/lib/db";
import { folders, testCases, scenarios } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getSessionWithOrg } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// Export format version for future compatibility
const EXPORT_VERSION = 1;

export interface ExportData {
  version: number;
  exportedAt: string;
  organizationId: string;
  data: {
    folders: Array<{
      id: number;
      name: string;
      parentId: number | null;
      order: number;
    }>;
    testCases: Array<{
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
    }>;
    scenarios: Array<{
      id: number;
      testCaseId: number;
      title: string;
      gherkin: string;
      order: number;
      createdAt: number;
      updatedAt: number;
    }>;
  };
}

export async function exportTestCases(): Promise<{ data?: ExportData; error?: string }> {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Fetch all folders for the organization
    const allFolders = await db
      .select({
        id: folders.id,
        name: folders.name,
        parentId: folders.parentId,
        order: folders.order,
      })
      .from(folders)
      .where(eq(folders.organizationId, organizationId));

    // Fetch all test cases for the organization
    const allTestCases = await db
      .select({
        id: testCases.id,
        legacyId: testCases.legacyId,
        title: testCases.title,
        folderId: testCases.folderId,
        order: testCases.order,
        template: testCases.template,
        state: testCases.state,
        priority: testCases.priority,
        createdAt: testCases.createdAt,
        updatedAt: testCases.updatedAt,
      })
      .from(testCases)
      .where(eq(testCases.organizationId, organizationId));

    // Fetch all scenarios for the test cases in this organization
    const testCaseIds = allTestCases.map((tc) => tc.id);

    let allScenarios: Array<{
      id: number;
      testCaseId: number;
      title: string;
      gherkin: string;
      order: number;
      createdAt: Date;
      updatedAt: Date;
    }> = [];

    if (testCaseIds.length > 0) {
      allScenarios = await db
        .select({
          id: scenarios.id,
          testCaseId: scenarios.testCaseId,
          title: scenarios.title,
          gherkin: scenarios.gherkin,
          order: scenarios.order,
          createdAt: scenarios.createdAt,
          updatedAt: scenarios.updatedAt,
        })
        .from(scenarios)
        .where(sql`${scenarios.testCaseId} IN (${sql.join(testCaseIds, sql`, `)})`);
    }

    const exportData: ExportData = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      organizationId,
      data: {
        folders: allFolders,
        testCases: allTestCases.map((tc) => ({
          ...tc,
          createdAt: tc.createdAt.getTime(),
          updatedAt: tc.updatedAt.getTime(),
        })),
        scenarios: allScenarios.map((s) => ({
          ...s,
          createdAt: s.createdAt.getTime(),
          updatedAt: s.updatedAt.getTime(),
        })),
      },
    };

    return { data: exportData };
  } catch (error) {
    console.error("Failed to export test cases:", error);
    return { error: "Failed to export test cases" };
  }
}

export async function importTestCases(
  exportData: ExportData,
  options: { clearExisting?: boolean } = {}
): Promise<{ success?: boolean; error?: string; stats?: { folders: number; testCases: number; scenarios: number } }> {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  // Validate export data
  if (!exportData.version || !exportData.data) {
    return { error: "Invalid export file format" };
  }

  if (exportData.version !== EXPORT_VERSION) {
    return { error: `Unsupported export version: ${exportData.version}. Expected: ${EXPORT_VERSION}` };
  }

  try {
    const { clearExisting = true } = options;

    if (clearExisting) {
      // Delete all existing scenarios for test cases in this organization
      const existingTestCases = await db
        .select({ id: testCases.id })
        .from(testCases)
        .where(eq(testCases.organizationId, organizationId));

      const existingTestCaseIds = existingTestCases.map((tc) => tc.id);

      if (existingTestCaseIds.length > 0) {
        await db
          .delete(scenarios)
          .where(sql`${scenarios.testCaseId} IN (${sql.join(existingTestCaseIds, sql`, `)})`);
      }

      // Delete all test cases for this organization
      await db
        .delete(testCases)
        .where(eq(testCases.organizationId, organizationId));

      // Delete all folders for this organization
      await db
        .delete(folders)
        .where(eq(folders.organizationId, organizationId));
    }

    // Create mapping from old IDs to new IDs
    const folderIdMap = new Map<number, number>();
    const testCaseIdMap = new Map<number, number>();

    // Import folders in order (parents before children)
    // Sort folders so parents come before children
    const sortedFolders = [...exportData.data.folders].sort((a, b) => {
      // Folders with no parent come first
      if (a.parentId === null && b.parentId !== null) return -1;
      if (a.parentId !== null && b.parentId === null) return 1;
      return 0;
    });

    // Process folders in multiple passes to handle nested structures
    const processedFolders = new Set<number>();
    let iterations = 0;
    const maxIterations = 100; // Prevent infinite loops

    while (processedFolders.size < sortedFolders.length && iterations < maxIterations) {
      iterations++;
      for (const folder of sortedFolders) {
        if (processedFolders.has(folder.id)) continue;

        // Check if parent is processed (or no parent)
        if (folder.parentId !== null && !folderIdMap.has(folder.parentId)) {
          continue; // Wait for parent to be processed
        }

        const newParentId = folder.parentId !== null ? folderIdMap.get(folder.parentId) ?? null : null;

        const result = await db
          .insert(folders)
          .values({
            name: folder.name,
            parentId: newParentId,
            order: folder.order,
            organizationId,
          })
          .returning({ id: folders.id });

        folderIdMap.set(folder.id, result[0].id);
        processedFolders.add(folder.id);
      }
    }

    // Import test cases
    for (const testCase of exportData.data.testCases) {
      const newFolderId = testCase.folderId !== null ? folderIdMap.get(testCase.folderId) ?? null : null;

      const result = await db
        .insert(testCases)
        .values({
          legacyId: testCase.legacyId,
          title: testCase.title,
          folderId: newFolderId,
          order: testCase.order,
          template: testCase.template as "bdd_feature" | "steps" | "text",
          state: testCase.state as "active" | "draft" | "retired" | "rejected",
          priority: testCase.priority as "normal" | "high" | "critical",
          organizationId,
          createdAt: new Date(testCase.createdAt),
          updatedAt: new Date(testCase.updatedAt),
        })
        .returning({ id: testCases.id });

      testCaseIdMap.set(testCase.id, result[0].id);
    }

    // Import scenarios
    for (const scenario of exportData.data.scenarios) {
      const newTestCaseId = testCaseIdMap.get(scenario.testCaseId);

      if (newTestCaseId === undefined) {
        console.warn(`Skipping scenario ${scenario.id}: parent test case ${scenario.testCaseId} not found`);
        continue;
      }

      await db.insert(scenarios).values({
        testCaseId: newTestCaseId,
        title: scenario.title,
        gherkin: scenario.gherkin,
        order: scenario.order,
        createdAt: new Date(scenario.createdAt),
        updatedAt: new Date(scenario.updatedAt),
      });
    }

    revalidatePath("/cases");
    revalidatePath("/");

    return {
      success: true,
      stats: {
        folders: folderIdMap.size,
        testCases: testCaseIdMap.size,
        scenarios: exportData.data.scenarios.length,
      },
    };
  } catch (error) {
    console.error("Failed to import test cases:", error);
    return { error: "Failed to import test cases" };
  }
}
