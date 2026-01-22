import { db } from "@/lib/db";
import { testRuns, testRunResults } from "@/lib/db/schema";
import { eq, sql, count } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await db
    .select()
    .from(testRuns)
    .orderBy(sql`${testRuns.createdAt} DESC`);

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

      return { ...run, stats, total };
    })
  );

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

      {runs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <RunIcon className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No test runs yet
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Create a test run to start tracking your testing progress and results.
            </p>
            <Link href="/runs/new">
              <Button>Create your first run</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">All Runs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {runStats.map((run) => {
                const passRate =
                  run.total > 0
                    ? Math.round(((run.stats.passed || 0) / run.total) * 100)
                    : 0;

                return (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-foreground group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                        {run.name}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-3 mt-0.5">
                        <span>
                          {run.createdAt?.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <span className="text-border">·</span>
                        <span>{run.total} cases</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-5">
                      {/* Progress Bar */}
                      {run.total > 0 && (
                        <div className="flex items-center gap-3">
                          <div className="w-28 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
                              style={{ width: `${passRate}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-muted-foreground w-10 tabular-nums">
                            {passRate}%
                          </span>
                        </div>
                      )}

                      {/* Status Badges */}
                      <div className="flex items-center gap-1.5">
                        {run.stats.passed && (
                          <Badge variant="success">{run.stats.passed}</Badge>
                        )}
                        {run.stats.failed && (
                          <Badge variant="destructive">{run.stats.failed}</Badge>
                        )}
                        {run.stats.pending && (
                          <Badge variant="secondary">{run.stats.pending}</Badge>
                        )}
                      </div>

                      {/* Run Status */}
                      <Badge
                        variant={run.status === "completed" ? "default" : "warning"}
                      >
                        {run.status}
                      </Badge>

                      <ChevronRightIcon className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function RunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
