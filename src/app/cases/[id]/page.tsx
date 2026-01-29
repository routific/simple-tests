import { db } from "@/lib/db";
import { testCases, folders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { TestCaseEditor } from "@/components/test-case-editor";
import { getSessionWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TestCaseDetailPage({ params }: Props) {
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/signin");
  }

  const { id } = await params;
  const caseId = parseInt(id);

  const testCase = await db
    .select()
    .from(testCases)
    .where(eq(testCases.id, caseId))
    .get();

  if (!testCase) {
    notFound();
  }

  const allFolders = await db.select().from(folders).orderBy(folders.name);

  const currentFolder = testCase.folderId
    ? allFolders.find((f) => f.id === testCase.folderId)
    : null;

  return (
    <div className="h-full flex flex-col">
      <TestCaseEditor
        testCase={testCase}
        folders={allFolders}
        currentFolder={currentFolder}
        linearWorkspace={session.user.organizationUrlKey}
      />
    </div>
  );
}
