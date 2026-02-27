import { db } from "@/lib/db";
import { releases, testRuns, testRunResults, users } from "@/lib/db/schema";
import { eq, count, sql, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getSessionWithOrg } from "@/lib/auth";
import { getIssuesByLabel } from "@/lib/linear";
import { type TestRunData } from "@/components/test-run-row";
import { EnvironmentGroups } from "@/components/environment-groups";
import { ReleaseHeader } from "./release-header";

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
  const decodedId = decodeURIComponent(id);

  // Try to find by ID first, then by linearLabelId, then by name
  let release;
  const numericId = parseInt(decodedId);

  if (!isNaN(numericId)) {
    // Try numeric ID first
    release = await db
      .select()
      .from(releases)
      .where(eq(releases.id, numericId))
      .get();
  }

  if (!release) {
    // Try by linearLabelId (UUID)
    release = await db
      .select()
      .from(releases)
      .where(eq(releases.linearLabelId, decodedId))
      .get();
  }

  if (!release) {
    // Fall back to name (for backwards compatibility)
    release = await db
      .select()
      .from(releases)
      .where(eq(releases.name, decodedId))
      .get();
  }

  if (!release || release.organizationId !== session.user.organizationId) {
    notFound();
  }

  const releaseId = release.id;

  // Fetch Linear issues if synced from Linear
  // Handle expired tokens gracefully
  let linearIssues: Awaited<ReturnType<typeof getIssuesByLabel>> = [];
  let linearAuthExpired = false;

  if (release.linearLabelId) {
    try {
      linearIssues = await getIssuesByLabel(release.linearLabelId);
    } catch (error) {
      // Use error.name check instead of instanceof - instanceof can fail across module boundaries in Next.js
      if (error instanceof Error && error.name === "LinearAuthError") {
        linearAuthExpired = true;
        console.warn("Linear auth expired, skipping issue fetch");
      } else {
        throw error;
      }
    }
  }

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

  // Calculate release summary for the completion modal
  const releaseSummary = {
    totalRuns: runStats.length,
    totalScenarios: runStats.reduce((sum, run) => sum + run.total, 0),
    passed: runStats.reduce((sum, run) => sum + (run.stats.passed || 0), 0),
    failed: runStats.reduce((sum, run) => sum + (run.stats.failed || 0), 0),
    pending: runStats.reduce((sum, run) => sum + (run.stats.pending || 0), 0),
    blocked: runStats.reduce((sum, run) => sum + (run.stats.blocked || 0), 0),
    skipped: runStats.reduce((sum, run) => sum + (run.stats.skipped || 0), 0),
  };

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      {/* Linear Auth Warning */}
      {linearAuthExpired && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center flex-shrink-0">
              <WarningIcon className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Linear connection expired
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Go to <a href="/releases" className="underline hover:text-yellow-900 dark:hover:text-yellow-100">Releases</a> and click &quot;Sync from Linear&quot; to re-authenticate.
              </p>
            </div>
          </div>
        </div>
      )}

      <ReleaseHeader
        release={{
          id: release.id,
          name: release.name,
          status: release.status as "active" | "completed",
          linearLabelId: release.linearLabelId,
        }}
        summary={releaseSummary}
      />

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
              <EnvironmentGroups
                runs={runStats}
                linearWorkspace={workspace}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
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

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
      />
    </svg>
  );
}
