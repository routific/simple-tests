import { db } from "@/lib/db";
import { testCases, folders, users, scenarios } from "@/lib/db/schema";
import { eq, like, and, count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { FolderPanel } from "@/components/folder-panel";
import { buildFolderTree } from "@/lib/folders";
import { TestCasesView } from "@/components/test-cases-view";
import { getSessionWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

interface Props {
  searchParams: Promise<{ folder?: string; q?: string; state?: string; offset?: string }>;
}

export default async function CasesPage({ searchParams }: Props) {
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/api/auth/signin");
  }

  const { organizationId } = session.user;

  const params = await searchParams;
  const folderId = params.folder ? parseInt(params.folder) : null;
  const search = params.q || "";
  const stateFilter = params.state || "";
  const offset = params.offset ? parseInt(params.offset) : 0;

  // Get all folders for this organization with case counts
  const allFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.organizationId, organizationId));

  // Build folder count conditions (apply state filter globally)
  const folderCountConditions = [eq(testCases.organizationId, organizationId)];
  if (stateFilter) {
    folderCountConditions.push(
      eq(testCases.state, stateFilter as "active" | "draft" | "retired" | "rejected")
    );
  }

  const folderCaseCounts = await db
    .select({
      folderId: testCases.folderId,
      count: count(),
    })
    .from(testCases)
    .where(and(...folderCountConditions))
    .groupBy(testCases.folderId);

  const caseCounts: Record<number, number> = {};
  folderCaseCounts.forEach((fc) => {
    if (fc.folderId) caseCounts[fc.folderId] = fc.count;
  });

  const foldersWithCounts = allFolders.map((f) => ({
    ...f,
    caseCount: caseCounts[f.id] || 0,
  }));

  const folderTree = buildFolderTree(foldersWithCounts);

  // Build query conditions - always filter by organization
  const conditions = [eq(testCases.organizationId, organizationId)];
  if (folderId) {
    conditions.push(eq(testCases.folderId, folderId));
  }
  if (search) {
    conditions.push(like(testCases.title, `%${search}%`));
  }
  if (stateFilter) {
    conditions.push(
      eq(testCases.state, stateFilter as "active" | "draft" | "retired" | "rejected")
    );
  }

  // Get total count of matching test cases
  const totalCountResult = await db
    .select({ count: count() })
    .from(testCases)
    .where(and(...conditions));
  const totalCount = totalCountResult[0]?.count || 0;

  // Calculate how many items to load (all items from 0 to current offset + PAGE_SIZE)
  const loadLimit = offset + PAGE_SIZE;

  // Get the test cases
  const casesData = await db
    .select({
      id: testCases.id,
      title: testCases.title,
      state: testCases.state,
      template: testCases.template,
      folderId: testCases.folderId,
      order: testCases.order,
      updatedAt: testCases.updatedAt,
      updatedBy: testCases.updatedBy,
      folderName: folders.name,
      updatedByName: users.name,
      updatedByUsername: users.linearUsername,
    })
    .from(testCases)
    .leftJoin(folders, eq(testCases.folderId, folders.id))
    .leftJoin(users, eq(testCases.updatedBy, users.id))
    .where(and(...conditions))
    .orderBy(testCases.order)
    .limit(loadLimit);

  // Get scenario counts per test case
  const scenarioCounts = await db
    .select({
      testCaseId: scenarios.testCaseId,
      count: count(),
    })
    .from(scenarios)
    .groupBy(scenarios.testCaseId);

  const scenarioCountMap: Record<number, number> = {};
  scenarioCounts.forEach((sc) => {
    scenarioCountMap[sc.testCaseId] = sc.count;
  });

  const cases = casesData.map((c) => ({
    ...c,
    scenarioCount: scenarioCountMap[c.id] || 0,
  }));

  const currentFolder = folderId
    ? allFolders.find((f) => f.id === folderId)
    : null;

  return (
    <div className="flex h-full animate-fade-in">
      {/* Sidebar - Folder Tree (Resizable) */}
      <FolderPanel
        folders={folderTree}
        selectedFolderId={folderId}
        caseCounts={caseCounts}
        stateFilter={stateFilter}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-auto flex flex-col">
        <TestCasesView
          cases={cases}
          folders={allFolders}
          currentFolderId={folderId}
          currentFolderName={currentFolder?.name || null}
          search={search}
          stateFilter={stateFilter}
          totalCount={totalCount}
          hasMore={cases.length < totalCount}
          currentOffset={offset}
        />
      </div>
    </div>
  );
}
