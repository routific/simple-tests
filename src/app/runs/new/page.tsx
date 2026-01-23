import { db } from "@/lib/db";
import { testCases, folders, scenarios } from "@/lib/db/schema";
import { eq, count, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CreateRunForm } from "@/components/create-run-form";
import { buildFolderTree } from "@/lib/folders";
import { getSessionWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ cases?: string }>;
}

export default async function NewRunPage({ searchParams }: Props) {
  const params = await searchParams;

  // Parse pre-selected case IDs from URL (e.g., ?cases=1,2,3)
  const initialSelectedCaseIds = params.cases
    ? params.cases.split(",").map((id) => parseInt(id, 10)).filter((id) => !isNaN(id))
    : [];
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/api/auth/signin");
  }

  const { organizationId } = session.user;

  const allFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.organizationId, organizationId));

  // Count all test cases (not filtered by state) for folder counts
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

  // Get all test cases for selection (include state for filtering)
  const casesData = await db
    .select({
      id: testCases.id,
      title: testCases.title,
      folderId: testCases.folderId,
      folderName: folders.name,
      state: testCases.state,
    })
    .from(testCases)
    .leftJoin(folders, eq(testCases.folderId, folders.id))
    .where(eq(testCases.organizationId, organizationId))
    .orderBy(testCases.title);

  // Get all scenarios for these test cases (include gherkin for preview)
  const caseIds = casesData.map((c) => c.id);
  const allScenarios = caseIds.length > 0
    ? await db
        .select({
          id: scenarios.id,
          title: scenarios.title,
          testCaseId: scenarios.testCaseId,
          gherkin: scenarios.gherkin,
        })
        .from(scenarios)
        .orderBy(scenarios.order)
    : [];

  // Group scenarios by test case
  const scenariosByCase: Record<number, { id: number; title: string; testCaseId: number; gherkin: string | null }[]> = {};
  allScenarios.forEach((s) => {
    if (!scenariosByCase[s.testCaseId]) {
      scenariosByCase[s.testCaseId] = [];
    }
    scenariosByCase[s.testCaseId].push(s);
  });

  // Add scenarios to each case
  const cases = casesData.map((c) => ({
    ...c,
    scenarios: scenariosByCase[c.id] || [],
  }));

  return (
    <div className="h-full flex flex-col">
      <CreateRunForm
        folders={folderTree}
        cases={cases}
        caseCounts={caseCounts}
        initialSelectedCaseIds={initialSelectedCaseIds}
      />
    </div>
  );
}
