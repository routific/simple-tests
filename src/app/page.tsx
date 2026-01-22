import { db } from "@/lib/db";
import { testCases, testRuns, testRunResults, folders } from "@/lib/db/schema";
import { count, eq, sql } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getStats() {
  const [totalCases] = await db.select({ count: count() }).from(testCases);
  const [totalRuns] = await db.select({ count: count() }).from(testRuns);
  const [totalFolders] = await db.select({ count: count() }).from(folders);

  const [activeCases] = await db
    .select({ count: count() })
    .from(testCases)
    .where(eq(testCases.state, "active"));

  const recentRuns = await db
    .select({
      id: testRuns.id,
      name: testRuns.name,
      status: testRuns.status,
      createdAt: testRuns.createdAt,
    })
    .from(testRuns)
    .orderBy(sql`${testRuns.createdAt} DESC`)
    .limit(5);

  const runStats = await Promise.all(
    recentRuns.map(async (run) => {
      const results = await db
        .select({ status: testRunResults.status, count: count() })
        .from(testRunResults)
        .where(eq(testRunResults.testRunId, run.id))
        .groupBy(testRunResults.status);

      const stats: Record<string, number> = {};
      results.forEach((r) => {
        stats[r.status] = r.count;
      });

      return { ...run, stats };
    })
  );

  return {
    totalCases: totalCases?.count || 0,
    activeCases: activeCases?.count || 0,
    totalRuns: totalRuns?.count || 0,
    totalFolders: totalFolders?.count || 0,
    recentRuns: runStats,
  };
}

export default async function Dashboard() {
  const stats = await getStats();

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-semibold mb-6">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Test Cases" value={stats.totalCases} />
        <StatCard label="Active Cases" value={stats.activeCases} />
        <StatCard label="Folders" value={stats.totalFolders} />
        <StatCard label="Test Runs" value={stats.totalRuns} />
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Recent Test Runs</h2>
          <Link
            href="/runs/new"
            className="px-3 py-1.5 text-sm font-medium text-white bg-[hsl(var(--primary))] rounded-md hover:opacity-90"
          >
            New Run
          </Link>
        </div>

        {stats.recentRuns.length === 0 ? (
          <div className="text-[hsl(var(--muted-foreground))] py-8 text-center border border-dashed rounded-lg">
            No test runs yet.{" "}
            <Link href="/runs/new" className="text-blue-600 hover:underline">
              Create your first run
            </Link>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {stats.recentRuns.map((run) => (
              <Link
                key={run.id}
                href={`/runs/${run.id}`}
                className="flex items-center justify-between p-4 hover:bg-[hsl(var(--muted))]"
              >
                <div>
                  <div className="font-medium">{run.name}</div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))]">
                    {run.createdAt?.toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {run.stats.passed && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded">
                      {run.stats.passed} passed
                    </span>
                  )}
                  {run.stats.failed && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded">
                      {run.stats.failed} failed
                    </span>
                  )}
                  {run.stats.pending && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                      {run.stats.pending} pending
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded ${
                      run.status === "completed"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {run.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-4">
        <Link
          href="/cases"
          className="flex-1 p-4 border rounded-lg hover:bg-[hsl(var(--muted))] transition-colors"
        >
          <h3 className="font-medium mb-1">Browse Test Cases</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            View and manage your test case repository
          </p>
        </Link>
        <Link
          href="/import"
          className="flex-1 p-4 border rounded-lg hover:bg-[hsl(var(--muted))] transition-colors"
        >
          <h3 className="font-medium mb-1">Import from Testmo</h3>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Upload CSV export to import test cases
          </p>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-4 border rounded-lg">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-[hsl(var(--muted-foreground))]">{label}</div>
    </div>
  );
}
