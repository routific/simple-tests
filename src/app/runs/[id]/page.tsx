import { db } from "@/lib/db";
import { testRuns, testRunResults, testCases, folders, scenarios, releases, users } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { RunExecutor } from "@/components/run-executor";
import { getSessionWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scenario?: string }>;
}

export default async function RunDetailPage({ params, searchParams }: Props) {
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/signin");
  }

  const { organizationId } = session.user;
  const { id } = await params;
  const { scenario: scenarioParam } = await searchParams;
  const runId = parseInt(id);
  const initialScenarioId = scenarioParam ? parseInt(scenarioParam) : null;

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
      executedBy: testRunResults.executedBy,
      scenarioId: testRunResults.scenarioId,
      scenarioTitle: scenarios.title,
      scenarioGherkin: scenarios.gherkin,
      testCaseId: scenarios.testCaseId,
      testCaseTitle: testCases.title,
      folderId: testCases.folderId,
      // Snapshot fields
      scenarioTitleSnapshot: testRunResults.scenarioTitleSnapshot,
      scenarioGherkinSnapshot: testRunResults.scenarioGherkinSnapshot,
      testCaseTitleSnapshot: testRunResults.testCaseTitleSnapshot,
    })
    .from(testRunResults)
    .innerJoin(scenarios, eq(testRunResults.scenarioId, scenarios.id))
    .innerJoin(testCases, eq(scenarios.testCaseId, testCases.id))
    .leftJoin(folders, eq(testCases.folderId, folders.id))
    .where(eq(testRunResults.testRunId, runId))
    .orderBy(folders.name, testCases.title, scenarios.order);

  // Fetch all folders for breadcrumb display
  const allFolders = await db
    .select({
      id: folders.id,
      name: folders.name,
      parentId: folders.parentId,
    })
    .from(folders)
    .where(eq(folders.organizationId, organizationId));

  // Collect all user IDs (creator + executors)
  const userIds = new Set<string>();
  if (run.createdBy) userIds.add(run.createdBy);
  results.forEach(r => {
    if (r.executedBy) userIds.add(r.executedBy);
  });

  // Always include the current user in the user IDs to fetch
  userIds.add(session.user.id);

  // Fetch user info for collaborators
  const allUsers = userIds.size > 0
    ? await db
        .select({
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        })
        .from(users)
        .where(inArray(users.id, Array.from(userIds)))
    : [];

  // Separate current user from collaborators (collaborators are those who have contributed)
  const currentUser = allUsers.find(u => u.id === session.user.id) || {
    id: session.user.id,
    name: session.user.name || "Unknown",
    avatar: session.user.image || null,
  };

  // Collaborators are creator + executors (not necessarily including current user unless they've contributed)
  const collaboratorIds = new Set<string>();
  if (run.createdBy) collaboratorIds.add(run.createdBy);
  results.forEach(r => {
    if (r.executedBy) collaboratorIds.add(r.executedBy);
  });
  const collaborators = allUsers.filter(u => collaboratorIds.has(u.id));

  // Fetch releases for editing
  const allReleases = await db
    .select({
      id: releases.id,
      name: releases.name,
      status: releases.status,
      linearLabelId: releases.linearLabelId,
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
        folders={allFolders}
        releases={allReleases as { id: number; name: string; status: "active" | "completed"; linearLabelId: string | null }[]}
        availableScenarios={availableScenarios}
        linearWorkspace={session.user.organizationUrlKey}
        collaborators={collaborators}
        currentUser={currentUser}
        initialScenarioId={initialScenarioId}
      />
    </div>
  );
}
