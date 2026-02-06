import { db } from "@/lib/db";
import { releases, testRuns, testRunResults, users } from "@/lib/db/schema";
import { eq, count, sql, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSessionWithOrg } from "@/lib/auth";
import { getIssuesByLabel } from "@/lib/linear";
import { TestRunRow, type TestRunData } from "@/components/test-run-row";
import { ReleaseStatusButton } from "../release-status-button";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReleaseDetailPage({ params }: Props) {
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/signin");
  }

  const { id } = await params;
  const releaseId = parseInt(id);

  const release = await db
    .select()
    .from(releases)
    .where(eq(releases.id, releaseId))
    .get();

  if (!release || release.organizationId !== session.user.organizationId) {
    notFound();
  }

  // Fetch Linear issues if synced from Linear
  const linearIssues = release.linearLabelId
    ? await getIssuesByLabel(release.linearLabelId)
    : [];

  // Fetch test runs for this release with stats
  const runs = await db
    .select()
    .from(testRuns)
    .where(eq(testRuns.releaseId, releaseId))
    .orderBy(sql`${testRuns.createdAt} DESC`);

  // Collect all user IDs (creators + executors)
  const allUserIds = new Set<string>();
  runs.forEach(run => {
    if (run.createdBy) allUserIds.add(run.createdBy);
  });

  // Get all executors from test results
  const runIds = runs.map(r => r.id);
  const allExecutors = runIds.length > 0
    ? await db
        .select({
          testRunId: testRunResults.testRunId,
          executedBy: testRunResults.executedBy,
        })
        .from(testRunResults)
        .where(sql`${testRunResults.executedBy} IS NOT NULL AND ${testRunResults.testRunId} IN (${sql.join(runIds.map(id => sql`${id}`), sql`, `)})`)
    : [];

  allExecutors.forEach(e => {
    if (e.executedBy) allUserIds.add(e.executedBy);
  });

  // Fetch all user info at once
  const allUsers = allUserIds.size > 0
    ? await db
        .select({
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        })
        .from(users)
        .where(inArray(users.id, Array.from(allUserIds)))
    : [];

  const usersMap = new Map(allUsers.map(u => [u.id, u]));

  // Build executor map per run
  const executorsByRun = new Map<number, Set<string>>();
  allExecutors.forEach(e => {
    if (e.executedBy) {
      if (!executorsByRun.has(e.testRunId)) {
        executorsByRun.set(e.testRunId, new Set());
      }
      executorsByRun.get(e.testRunId)!.add(e.executedBy);
    }
  });

  const runStats: TestRunData[] = await Promise.all(
    runs.map(async (run) => {
      const results = await db
        .select({
          status: testRunResults.status,
          count: count(),
        })
        .from(testRunResults)
        .where(eq(testRunResults.testRunId, run.id))
        .groupBy(testRunResults.status);

      const stats: Record<string, number> = {};
      let total = 0;
      results.forEach((r) => {
        stats[r.status] = r.count;
        total += r.count;
      });

      // Build collaborators list for this run
      const collaboratorIds = new Set<string>();
      if (run.createdBy) collaboratorIds.add(run.createdBy);
      executorsByRun.get(run.id)?.forEach(id => collaboratorIds.add(id));

      const collaborators = Array.from(collaboratorIds)
        .map(id => usersMap.get(id))
        .filter((u): u is { id: string; name: string; avatar: string | null } => u !== undefined);

      return {
        id: run.id,
        name: run.name,
        releaseId: run.releaseId,
        status: run.status,
        environment: run.environment,
        createdAt: run.createdAt,
        linearIssueIdentifier: run.linearIssueIdentifier,
        linearProjectId: run.linearProjectId,
        linearProjectName: run.linearProjectName,
        linearMilestoneId: run.linearMilestoneId,
        linearMilestoneName: run.linearMilestoneName,
        stats,
        total,
        collaborators,
      };
    })
  );

  const workspace = session.user.organizationUrlKey;

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      {/* Back link */}
      <Link
        href="/releases"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 inline-flex items-center gap-1"
      >
        <ChevronLeftIcon className="w-4 h-4" />
        All Releases
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-8 mt-2">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          {release.name}
        </h1>
        <Badge variant={release.status === "active" ? "default" : "secondary"}>
          {release.status}
        </Badge>
        <ReleaseStatusButton
          releaseId={release.id}
          status={release.status as "active" | "completed"}
        />
        {release.linearLabelId && (
          <span className="text-xs text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded-full">
            Synced from Linear
          </span>
        )}
      </div>

      <div className="space-y-8">
        {/* Linear Issues */}
        {release.linearLabelId && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Linear Issues ({linearIssues.length})
            </h2>
            {linearIssues.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-muted-foreground">
                  No issues tagged with this release label in Linear.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-2">
                {linearIssues.map((issue) => (
                  <Card key={issue.id}>
                    <CardContent className="py-3 flex items-center gap-3">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: issue.state.color }}
                        title={issue.state.name}
                      />
                      <a
                        href={`https://linear.app/${workspace}/issue/${issue.identifier}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm text-brand-600 dark:text-brand-400 hover:underline"
                      >
                        {issue.identifier}
                      </a>
                      <span className="text-foreground">{issue.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {issue.state.name}
                      </span>
                      <a
                        href={`https://linear.app/${workspace}/issue/${issue.identifier}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ExternalLinkIcon className="w-4 h-4" />
                      </a>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Test Runs */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Test Runs ({runStats.length})
          </h2>
          {runStats.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center text-muted-foreground">
                No test runs assigned to this release yet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <div className="divide-y divide-border">
                {runStats.map((run) => (
                  <TestRunRow
                    key={run.id}
                    run={run}
                    linearWorkspace={workspace}
                  />
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
      />
    </svg>
  );
}
