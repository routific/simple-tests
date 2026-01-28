import { redirect } from "next/navigation";
import { getSessionWithOrg } from "@/lib/auth";
import { getAllAuditLogs } from "@/app/cases/actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Helper to format time ago
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Helper to format audit log actions
function formatAuditAction(action: string, changesJson: string): string {
  try {
    const changes = JSON.parse(changesJson) as Array<{ field: string; oldValue: unknown; newValue: unknown }>;

    if (action === "created") {
      return "created";
    }

    if (action === "deleted") {
      return "deleted";
    }

    if (changes.length === 0) {
      return "updated";
    }

    const descriptions = changes.map((change) => {
      if (change.field === "scenario.added") {
        return `added scenario "${change.newValue}"`;
      }
      if (change.field === "scenario.removed") {
        return `removed scenario "${change.oldValue}"`;
      }
      if (change.field === "scenario.title") {
        return `renamed scenario`;
      }
      if (change.field === "scenario.gherkin") {
        return "updated steps";
      }
      if (change.field === "title") {
        return "renamed";
      }
      if (change.field === "state") {
        return `changed state to ${change.newValue}`;
      }
      if (change.field === "folderId") {
        return "moved";
      }
      return `updated ${change.field}`;
    });

    return descriptions.join(", ");
  } catch {
    return "updated";
  }
}

// Group logs by date
function groupByDate(logs: Array<{ createdAt: Date; [key: string]: unknown }>) {
  const groups: Map<string, typeof logs> = new Map();

  for (const log of logs) {
    const date = new Date(log.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let key: string;
    if (date.toDateString() === today.toDateString()) {
      key = "Today";
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = "Yesterday";
    } else {
      key = date.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(log);
  }

  return groups;
}

export default async function ChangelogPage() {
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/signin");
  }

  const logs = await getAllAuditLogs(200);
  const groupedLogs = groupByDate(logs);

  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between bg-background">
        <div className="flex items-center gap-4">
          <Link
            href="/cases"
            className="p-2 -m-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <BackIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Changelog</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Recent changes across all test cases
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {logs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <HistoryIcon className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground mb-1">No changes yet</p>
            <p className="text-sm text-muted-foreground">
              Changes to test cases will appear here.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-6 px-4">
            {Array.from(groupedLogs.entries()).map(([date, dateLogs]) => (
              <div key={date} className="mb-8">
                <h2 className="text-sm font-medium text-muted-foreground mb-3 sticky top-0 bg-background py-2">
                  {date}
                </h2>
                <div className="space-y-3">
                  {dateLogs.map((entry) => (
                    <div
                      key={entry.id as number}
                      className="flex gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
                    >
                      {(entry.userAvatar as string | null) ? (
                        <img
                          src={entry.userAvatar as string}
                          alt=""
                          className="w-8 h-8 rounded-full flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <span className="text-sm text-muted-foreground">
                            {((entry.userName as string | null) || "?").charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm">
                            <span className="font-medium text-foreground">
                              {(entry.userName as string | null) || "Unknown"}
                            </span>
                            {" "}
                            <span className="text-muted-foreground">
                              {formatAuditAction(entry.action as string, entry.changes as string)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatTimeAgo(entry.createdAt as Date)}
                          </span>
                        </div>
                        <Link
                          href={`/cases?case=${entry.testCaseId}`}
                          className="text-sm text-brand-600 dark:text-brand-400 hover:underline mt-1 block truncate"
                        >
                          {(entry.testCaseTitle as string | null) || "Deleted test case"}
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BackIcon({ className }: { className?: string }) {
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
        d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
      />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
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
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
