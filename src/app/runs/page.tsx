import { db } from "@/lib/db";
import { testRuns, testRunResults } from "@/lib/db/schema";
import { eq, sql, count } from "drizzle-orm";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Test Runs</h1>
        <Link
          href="/runs/new"
          className="px-4 py-2 text-sm font-medium text-white bg-[hsl(var(--primary))] rounded-md hover:opacity-90"
        >
          New Run
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <h3 className="text-lg font-medium mb-2">No test runs yet</h3>
          <p className="text-[hsl(var(--muted-foreground))] mb-4">
            Create a test run to start tracking your testing progress.
          </p>
          <Link
            href="/runs/new"
            className="inline-block px-4 py-2 text-sm font-medium text-white bg-[hsl(var(--primary))] rounded-md hover:opacity-90"
          >
            Create your first run
          </Link>
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {runStats.map((run) => {
            const passRate =
              run.total > 0
                ? Math.round(((run.stats.passed || 0) / run.total) * 100)
                : 0;

            return (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="flex items-center justify-between p-4 hover:bg-[hsl(var(--muted))]"
              >
                <div>
                  <div className="font-medium">{run.name}</div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))] flex items-center gap-3">
                    <span>{run.createdAt?.toLocaleDateString()}</span>
                    <span>{run.total} cases</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {run.total > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${passRate}%` }}
                        />
                      </div>
                      <span className="text-sm text-[hsl(var(--muted-foreground))]">
                        {passRate}%
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    {run.stats.passed && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded">
                        {run.stats.passed}
                      </span>
                    )}
                    {run.stats.failed && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded">
                        {run.stats.failed}
                      </span>
                    )}
                    {run.stats.pending && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                        {run.stats.pending}
                      </span>
                    )}
                  </div>

                  <span
                    className={cn(
                      "px-2 py-0.5 text-xs font-medium rounded",
                      run.status === "completed"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-yellow-100 text-yellow-800"
                    )}
                  >
                    {run.status}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
