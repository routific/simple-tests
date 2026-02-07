import { db } from "@/lib/db";
import { releases, testRuns } from "@/lib/db/schema";
import { eq, sql, count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getSessionWithOrg } from "@/lib/auth";
import { getIssuesByLabel, LinearAuthError } from "@/lib/linear";
import { SyncButton } from "./sync-button";
import { ReleasesList } from "./releases-list";

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
  // Handle expired tokens gracefully - just skip issue counts
  let issueCountMap = new Map<number, number>();
  let linearAuthExpired = false;

  try {
    const issueCountEntries = await Promise.all(
      allReleases
        .filter((r) => r.linearLabelId)
        .map(async (r) => {
          const issues = await getIssuesByLabel(r.linearLabelId!);
          return [r.id, issues.length] as const;
        })
    );
    issueCountMap = new Map(issueCountEntries);
  } catch (error) {
    if (error instanceof LinearAuthError) {
      // Token expired - continue without issue counts
      linearAuthExpired = true;
      console.warn("Linear auth expired, skipping issue counts");
    } else {
      throw error;
    }
  }

  const releasesData = allReleases.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status as "active" | "completed",
    linearLabelId: r.linearLabelId,
    runCount: runCountMap.get(r.id) ?? 0,
    issueCount: issueCountMap.get(r.id) ?? null,
  }));

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
                Please sign out and sign in again to refresh your Linear connection.
              </p>
            </div>
          </div>
        </div>
      )}

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
              Click &quot;Sync from Linear&quot; to import releases from your
              Linear workspace&apos;s Releases label group.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ReleasesList releases={releasesData} />
      )}
    </div>
  );
}

function TagIcon({ className }: { className?: string }) {
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
        d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 6h.008v.008H6V6z"
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
