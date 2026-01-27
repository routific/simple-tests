import { db } from "@/lib/db";
import { testRuns, testRunResults, releases } from "@/lib/db/schema";
import { eq, sql, count } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSessionWithOrg } from "@/lib/auth";
import { RunsList } from "./runs-list";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/signin");
  }

  const { organizationId } = session.user;

  // Fetch all releases
  const allReleases = await db
    .select({
      id: releases.id,
      name: releases.name,
      status: releases.status,
    })
    .from(releases)
    .where(eq(releases.organizationId, organizationId))
    .orderBy(releases.createdAt);

  // Fetch all runs
  const runs = await db
    .select()
    .from(testRuns)
    .where(eq(testRuns.organizationId, organizationId))
    .orderBy(sql`${testRuns.createdAt} DESC`);

  // Get stats for each run
  const runStats = await Promise.all(
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

      return {
        id: run.id,
        name: run.name,
        releaseId: run.releaseId,
        status: run.status,
        createdAt: run.createdAt,
        linearIssueIdentifier: run.linearIssueIdentifier,
        linearProjectId: run.linearProjectId,
        linearProjectName: run.linearProjectName,
        linearMilestoneId: run.linearMilestoneId,
        linearMilestoneName: run.linearMilestoneName,
        stats,
        total,
      };
    })
  );

  const hasRuns = runs.length > 0;
  const hasReleases = allReleases.length > 0;

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Test Runs
          </h1>
          <p className="text-muted-foreground mt-1">
            Track and manage your testing sessions
          </p>
        </div>
        <Link href="/runs/new">
          <Button>
            <PlusIcon className="w-4 h-4" />
            New Run
          </Button>
        </Link>
      </div>

      {!hasRuns && !hasReleases ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <RunIcon className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No test runs yet
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Create a test run to start tracking your testing progress and
              results.
            </p>
            <Link href="/runs/new">
              <Button>Create your first run</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <RunsList
          runs={runStats}
          releases={allReleases as { id: number; name: string; status: "active" | "completed" }[]}
          linearWorkspace={session.user.organizationUrlKey}
        />
      )}
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
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
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}

function RunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
      />
    </svg>
  );
}
