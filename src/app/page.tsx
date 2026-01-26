import { db } from "@/lib/db";
import { testCases, testRuns, testRunResults, folders } from "@/lib/db/schema";
import { count, eq, sql, and } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getSessionWithOrg } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function getStats(organizationId: string) {
  const [totalCases] = await db
    .select({ count: count() })
    .from(testCases)
    .where(eq(testCases.organizationId, organizationId));

  const [totalRuns] = await db
    .select({ count: count() })
    .from(testRuns)
    .where(eq(testRuns.organizationId, organizationId));

  const [totalFolders] = await db
    .select({ count: count() })
    .from(folders)
    .where(eq(folders.organizationId, organizationId));

  const [activeCases] = await db
    .select({ count: count() })
    .from(testCases)
    .where(and(eq(testCases.organizationId, organizationId), eq(testCases.state, "active")));

  const recentRuns = await db
    .select({
      id: testRuns.id,
      name: testRuns.name,
      status: testRuns.status,
      createdAt: testRuns.createdAt,
    })
    .from(testRuns)
    .where(eq(testRuns.organizationId, organizationId))
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
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/api/auth/signin");
  }

  const stats = await getStats(session.user.organizationId);

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Overview of your test management workspace
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Test Cases"
          value={stats.totalCases}
          icon={<TestCaseIcon />}
        />
        <StatCard
          label="Active Cases"
          value={stats.activeCases}
          icon={<ActiveIcon />}
          highlight
        />
        <StatCard
          label="Folders"
          value={stats.totalFolders}
          icon={<FolderIcon />}
        />
        <StatCard
          label="Test Runs"
          value={stats.totalRuns}
          icon={<RunIcon />}
        />
      </div>

      {/* Recent Runs */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-lg">Recent Test Runs</CardTitle>
          <Link href="/runs/new">
            <Button size="sm">
              <PlusIcon className="w-4 h-4" />
              New Run
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {stats.recentRuns.length === 0 ? (
            <div className="text-muted-foreground py-12 text-center border border-dashed border-border rounded-lg bg-muted/30">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <RunIcon className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="font-medium text-foreground mb-1">No test runs yet</p>
              <p className="text-sm">
                <Link href="/runs/new" className="text-brand-500 hover:text-brand-600 font-medium">
                  Create your first run
                </Link>{" "}
                to get started
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
              {stats.recentRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <div className="font-medium text-foreground">{run.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {run.createdAt?.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.stats.passed && (
                      <Badge variant="success">{run.stats.passed} passed</Badge>
                    )}
                    {run.stats.failed && (
                      <Badge variant="destructive">{run.stats.failed} failed</Badge>
                    )}
                    {run.stats.pending && (
                      <Badge variant="secondary">{run.stats.pending} pending</Badge>
                    )}
                    <Badge
                      variant={run.status === "completed" ? "default" : "warning"}
                    >
                      {run.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link href="/cases" className="group">
          <Card className="h-full transition-all duration-200 hover:shadow-elevated hover:border-brand-200 dark:hover:border-brand-800">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0 group-hover:bg-brand-500/20 transition-colors">
                <TestCaseIcon className="w-5 h-5 text-brand-500" />
              </div>
              <div>
                <h3 className="font-medium text-foreground mb-1">Browse Test Cases</h3>
                <p className="text-sm text-muted-foreground">
                  View and manage your test case repository
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/import" className="group">
          <Card className="h-full transition-all duration-200 hover:shadow-elevated hover:border-brand-200 dark:hover:border-brand-800">
            <CardContent className="p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0 group-hover:bg-brand-500/20 transition-colors">
                <ImportIcon className="w-5 h-5 text-brand-500" />
              </div>
              <div>
                <h3 className="font-medium text-foreground mb-1">Import / Export</h3>
                <p className="text-sm text-muted-foreground">
                  Backup or restore test case data
                </p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-brand-200 dark:border-brand-800 bg-brand-50/50 dark:bg-brand-950/20" : ""}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
            highlight
              ? "bg-brand-500/20 text-brand-600 dark:text-brand-400"
              : "bg-muted text-muted-foreground"
          }`}>
            {icon}
          </div>
        </div>
        <div className="text-2xl font-semibold text-foreground tabular-nums">
          {value.toLocaleString()}
        </div>
        <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}

function TestCaseIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
    </svg>
  );
}

function ActiveIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function FolderIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function RunIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  );
}

function PlusIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function ImportIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}
