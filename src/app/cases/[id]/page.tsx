import { db } from "@/lib/db";
import { testCases, folders, scenarios, testCaseLinearIssues } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
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

  const { organizationId } = session.user;
  const { id } = await params;
  const caseId = parseInt(id);

  // Fetch test case, scenarios, linked issues, and folders in parallel
  const [testCase, allFolders, testCaseScenarios, linkedIssues] = await Promise.all([
    db
      .select()
      .from(testCases)
      .where(and(eq(testCases.id, caseId), eq(testCases.organizationId, organizationId)))
      .get(),
    db.select().from(folders).where(eq(folders.organizationId, organizationId)).orderBy(folders.name),
    db
      .select({
        id: scenarios.id,
        title: scenarios.title,
        gherkin: scenarios.gherkin,
        order: scenarios.order,
      })
      .from(scenarios)
      .where(eq(scenarios.testCaseId, caseId))
      .orderBy(scenarios.order),
    db
      .select({
        id: testCaseLinearIssues.linearIssueId,
        identifier: testCaseLinearIssues.linearIssueIdentifier,
        title: testCaseLinearIssues.linearIssueTitle,
      })
      .from(testCaseLinearIssues)
      .where(eq(testCaseLinearIssues.testCaseId, caseId)),
  ]);

  if (!testCase) {
    notFound();
  }

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
        initialScenarios={testCaseScenarios}
        initialLinkedIssues={linkedIssues}
      />
    </div>
  );
}
