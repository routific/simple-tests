import { db } from "@/lib/db";
import { testRuns, testRunResults, testCases, folders, scenarios, releases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { RunExecutor } from "@/components/run-executor";
import { getSessionWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RunDetailPage({ params }: Props) {
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/signin");
  }

  const { organizationId } = session.user;
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

  // Fetch releases for editing
  const allReleases = await db
    .select({
      id: releases.id,
      name: releases.name,
      status: releases.status,
    })
    .from(releases)
    .where(eq(releases.organizationId, organizationId))
    .orderBy(releases.createdAt);

  // Fetch all available scenarios for adding to run
  const availableScenarios = await db
    .select({
      id: scenarios.id,
      title: scenarios.title,
      testCaseId: scenarios.testCaseId,
      testCaseTitle: testCases.title,
      folderName: folders.name,
    })
    .from(scenarios)
    .innerJoin(testCases, eq(scenarios.testCaseId, testCases.id))
    .leftJoin(folders, eq(testCases.folderId, folders.id))
    .where(eq(testCases.organizationId, organizationId))
    .orderBy(folders.name, testCases.title, scenarios.order);

  return (
    <div className="h-full flex flex-col">
      <RunExecutor
        run={run}
        results={results}
        releases={allReleases as { id: number; name: string; status: "active" | "completed" }[]}
        availableScenarios={availableScenarios}
      />
    </div>
  );
}
