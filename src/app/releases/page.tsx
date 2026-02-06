import { db } from "@/lib/db";
import { releases, testRuns } from "@/lib/db/schema";
import { eq, sql, count } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSessionWithOrg } from "@/lib/auth";
import { getIssuesByLabel } from "@/lib/linear";
import { SyncButton } from "./sync-button";

export const dynamic = "force-dynamic";

export default async function ReleasesPage() {
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/signin");
  }

  const { organizationId } = session.user;

  // Fetch all releases
  const allReleases = await db
    .select()
    .from(releases)
    .where(eq(releases.organizationId, organizationId))
    .orderBy(sql`${releases.createdAt} DESC`);

  // Get run counts per release
  const runCounts = await db
    .select({
      releaseId: testRuns.releaseId,
      count: count(),
    })
    .from(testRuns)
    .where(eq(testRuns.organizationId, organizationId))
    .groupBy(testRuns.releaseId);

  const runCountMap = new Map(
    runCounts
      .filter((r) => r.releaseId !== null)
      .map((r) => [r.releaseId!, r.count])
  );

  // Fetch Linear issue counts for synced releases (in parallel)
  const issueCountEntries = await Promise.all(
    allReleases
      .filter((r) => r.linearLabelId)
      .map(async (r) => {
        const issues = await getIssuesByLabel(r.linearLabelId!);
        return [r.id, issues.length] as const;
      })
  );
  const issueCountMap = new Map(issueCountEntries);

  const activeReleases = allReleases.filter((r) => r.status === "active");
  const completedReleases = allReleases.filter((r) => r.status === "completed");

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Releases
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage releases synced from Linear
          </p>
        </div>
        <SyncButton />
      </div>

      {allReleases.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <TagIcon className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No releases yet
            </h3>
            <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
              Click &quot;Sync from Linear&quot; to import releases from your Linear
              workspace&apos;s Releases label group.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {activeReleases.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Active ({activeReleases.length})
              </h2>
              <div className="grid gap-3">
                {activeReleases.map((release) => (
                  <ReleaseCard
                    key={release.id}
                    release={release}
                    runCount={runCountMap.get(release.id) ?? 0}
                    issueCount={issueCountMap.get(release.id) ?? null}
                  />
                ))}
              </div>
            </div>
          )}

          {completedReleases.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Completed ({completedReleases.length})
              </h2>
              <div className="grid gap-3">
                {completedReleases.map((release) => (
                  <ReleaseCard
                    key={release.id}
                    release={release}
                    runCount={runCountMap.get(release.id) ?? 0}
                    issueCount={issueCountMap.get(release.id) ?? null}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReleaseCard({
  release,
  runCount,
  issueCount,
}: {
  release: typeof releases.$inferSelect;
  runCount: number;
  issueCount: number | null;
}) {
  return (
    <Link href={`/releases/${release.id}`}>
      <Card className="hover:shadow-card transition-shadow cursor-pointer">
        <CardContent className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TagIcon className="w-5 h-5 text-muted-foreground" />
            <div>
              <div className="font-medium text-foreground">{release.name}</div>
              <div className="text-sm text-muted-foreground">
                {runCount} test run{runCount !== 1 ? "s" : ""}
                {issueCount !== null && (
                  <span className="ml-2">&middot; {issueCount} issue{issueCount !== 1 ? "s" : ""}</span>
                )}
                {release.linearLabelId && (
                  <span className="ml-2 text-xs text-brand-500">Synced from Linear</span>
                )}
              </div>
            </div>
          </div>
          <Badge variant={release.status === "active" ? "default" : "secondary"}>
            {release.status}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}
