import { db } from "@/lib/db";
import { testCases, folders } from "@/lib/db/schema";
import { eq, like, sql, and, count } from "drizzle-orm";
import { FolderPanel } from "@/components/folder-panel";
import { buildFolderTree } from "@/lib/folders";
import { TestCasesView } from "@/components/test-cases-view";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ folder?: string; q?: string; state?: string }>;
}

export default async function CasesPage({ searchParams }: Props) {
  const params = await searchParams;
  const folderId = params.folder ? parseInt(params.folder) : null;
  const search = params.q || "";
  const stateFilter = params.state || "";

  // Get all folders with case counts
  const allFolders = await db.select().from(folders);
  const folderCaseCounts = await db
    .select({
      folderId: testCases.folderId,
      count: count(),
    })
    .from(testCases)
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

  // Build query conditions
  const conditions = [];
  if (folderId) {
    conditions.push(eq(testCases.folderId, folderId));
  }
  if (search) {
    conditions.push(like(testCases.title, `%${search}%`));
  }
  if (stateFilter) {
    conditions.push(eq(testCases.state, stateFilter as "active" | "draft" | "retired" | "rejected"));
  }

  const cases = await db
    .select({
      id: testCases.id,
      title: testCases.title,
      state: testCases.state,
      template: testCases.template,
      gherkin: testCases.gherkin,
      folderId: testCases.folderId,
      updatedAt: testCases.updatedAt,
      folderName: folders.name,
    })
    .from(testCases)
    .leftJoin(folders, eq(testCases.folderId, folders.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${testCases.updatedAt} DESC`)
    .limit(100);

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
        />
      </div>
    </div>
  );
}
