import { db } from "@/lib/db";
import { testCases, folders } from "@/lib/db/schema";
import { eq, like, sql, and, count } from "drizzle-orm";
import Link from "next/link";
import { FolderTree } from "@/components/folder-tree";
import { buildFolderTree } from "@/lib/folders";
import { TestCaseList } from "@/components/test-case-list";

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
    <div className="flex h-full">
      <div className="w-64 border-r border-[hsl(var(--border))] bg-[hsl(var(--muted))] overflow-auto">
        <div className="p-3 border-b border-[hsl(var(--border))]">
          <h2 className="font-medium text-sm">Folders</h2>
        </div>
        <FolderTree
          folders={folderTree}
          selectedFolderId={folderId}
          caseCounts={caseCounts}
        />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              {currentFolder?.name || "All Test Cases"}
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {cases.length} test case{cases.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href={`/cases/new${folderId ? `?folder=${folderId}` : ""}`}
            className="px-3 py-1.5 text-sm font-medium text-white bg-[hsl(var(--primary))] rounded-md hover:opacity-90"
          >
            New Case
          </Link>
        </div>

        <TestCaseList
          cases={cases}
          folderId={folderId}
          search={search}
          stateFilter={stateFilter}
        />
      </div>
    </div>
  );
}
