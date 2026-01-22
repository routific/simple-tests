import { db } from "@/lib/db";
import { testCases, folders, users } from "@/lib/db/schema";
import { eq, like, sql, and, count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { FolderPanel } from "@/components/folder-panel";
import { buildFolderTree } from "@/lib/folders";
import { TestCasesView } from "@/components/test-cases-view";
import { getSessionWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ folder?: string; q?: string; state?: string }>;
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

  // Get all folders for this organization with case counts
  const allFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.organizationId, organizationId));

  const folderCaseCounts = await db
    .select({
      folderId: testCases.folderId,
      count: count(),
    })
    .from(testCases)
    .where(eq(testCases.organizationId, organizationId))
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

  const cases = await db
    .select({
      id: testCases.id,
      title: testCases.title,
      state: testCases.state,
      template: testCases.template,
      gherkin: testCases.gherkin,
      folderId: testCases.folderId,
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
