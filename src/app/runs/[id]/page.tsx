import { db } from "@/lib/db";
import { testRuns, testRunResults, testCases, folders, scenarios } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { RunExecutor } from "@/components/run-executor";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RunDetailPage({ params }: Props) {
  const { id } = await params;
  const runId = parseInt(id);

  const run = await db.select().from(testRuns).where(eq(testRuns.id, runId)).get();

  if (!run) {
    notFound();
  }

  const results = await db
    .select({
      id: testRunResults.id,
      status: testRunResults.status,
      notes: testRunResults.notes,
      executedAt: testRunResults.executedAt,
      scenarioId: testRunResults.scenarioId,
      scenarioTitle: scenarios.title,
      scenarioGherkin: scenarios.gherkin,
      testCaseId: scenarios.testCaseId,
      testCaseTitle: testCases.title,
      folderName: folders.name,
    })
    .from(testRunResults)
    .innerJoin(scenarios, eq(testRunResults.scenarioId, scenarios.id))
    .innerJoin(testCases, eq(scenarios.testCaseId, testCases.id))
    .leftJoin(folders, eq(testCases.folderId, folders.id))
    .where(eq(testRunResults.testRunId, runId))
    .orderBy(folders.name, testCases.title, scenarios.order);

  return (
    <div className="h-full flex flex-col">
      <RunExecutor run={run} results={results} />
    </div>
  );
}
