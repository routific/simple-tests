import { db } from "@/lib/db";
import { testCases, folders } from "@/lib/db/schema";
import { eq, count, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CreateRunForm } from "@/components/create-run-form";
import { buildFolderTree } from "@/lib/folders";
import { getSessionWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewRunPage() {
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/api/auth/signin");
  }

  const { organizationId } = session.user;

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
    .where(
      and(
        eq(testCases.state, "active"),
        eq(testCases.organizationId, organizationId)
      )
    )
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
    .where(
      and(
        eq(testCases.state, "active"),
        eq(testCases.organizationId, organizationId)
      )
    )
    .orderBy(testCases.title);

  return (
    <div className="h-full flex flex-col">
      <CreateRunForm folders={folderTree} cases={cases} caseCounts={caseCounts} />
    </div>
  );
}
