import { db } from "@/lib/db";
import { testCases, folders } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { CreateRunForm } from "@/components/create-run-form";
import { buildFolderTree } from "@/lib/folders";

export const dynamic = "force-dynamic";

export default async function NewRunPage() {
  const allFolders = await db.select().from(folders);
  const folderCaseCounts = await db
    .select({
      folderId: testCases.folderId,
      count: count(),
    })
    .from(testCases)
    .where(eq(testCases.state, "active"))
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

  // Get all active test cases for selection
  const cases = await db
    .select({
      id: testCases.id,
      title: testCases.title,
      folderId: testCases.folderId,
      folderName: folders.name,
    })
    .from(testCases)
    .leftJoin(folders, eq(testCases.folderId, folders.id))
    .where(eq(testCases.state, "active"))
    .orderBy(testCases.title);

  return (
    <div className="h-full flex flex-col">
      <CreateRunForm folders={folderTree} cases={cases} caseCounts={caseCounts} />
    </div>
  );
}
