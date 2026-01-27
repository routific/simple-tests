"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { completeRelease, reopenRelease } from "@/app/releases/actions";

interface RunWithStats {
  id: number;
  name: string;
  releaseId: number | null;
  status: "in_progress" | "completed";
  environment: "sandbox" | "dev" | "staging" | "prod" | null;
  createdAt: Date | null;
  linearIssueIdentifier: string | null;
  linearProjectId: string | null;
  linearProjectName: string | null;
  linearMilestoneId: string | null;
  linearMilestoneName: string | null;
  stats: Record<string, number>;
  total: number;
}

interface Release {
  id: number;
  name: string;
  status: "active" | "completed";
}

interface RunsListProps {
  runs: RunWithStats[];
  releases: Release[];
  linearWorkspace?: string;
}

export function RunsList({ runs, releases, linearWorkspace }: RunsListProps) {
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [expandedReleases, setExpandedReleases] = useState<Set<number | "unassigned">>(() => {
    const ids: (number | "unassigned")[] = ["unassigned", ...releases.filter(r => r.status === "active").map(r => r.id)];
    return new Set(ids);
  });
  const [isPending, startTransition] = useTransition();
  const [optimisticReleases, setOptimisticReleases] = useState(releases);

  // Group runs by release
  const runsByRelease = new Map<number | "unassigned", RunWithStats[]>();
  runsByRelease.set("unassigned", []);

  for (const release of optimisticReleases) {
    runsByRelease.set(release.id, []);
  }

  for (const run of runs) {
    const key = run.releaseId ?? "unassigned";
    const existing = runsByRelease.get(key) || [];
    existing.push(run);
    runsByRelease.set(key, existing);
  }

  // Filter releases by status for current tab
  const activeReleases = optimisticReleases.filter(r => r.status === "active");
  const completedReleases = optimisticReleases.filter(r => r.status === "completed");

  const toggleExpand = (id: number | "unassigned") => {
    setExpandedReleases(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCompleteRelease = (releaseId: number) => {
    // Optimistic update
    setOptimisticReleases(prev => prev.map(r =>
      r.id === releaseId ? { ...r, status: "completed" as const } : r
    ));

    startTransition(async () => {
      const result = await completeRelease(releaseId);
      if (result.error) {
        // Revert on error
        setOptimisticReleases(prev => prev.map(r =>
          r.id === releaseId ? { ...r, status: "active" as const } : r
        ));
      }
    });
  };

  const handleReopenRelease = (releaseId: number) => {
    // Optimistic update
    setOptimisticReleases(prev => prev.map(r =>
      r.id === releaseId ? { ...r, status: "active" as const } : r
    ));

    startTransition(async () => {
      const result = await reopenRelease(releaseId);
      if (result.error) {
        // Revert on error
        setOptimisticReleases(prev => prev.map(r =>
          r.id === releaseId ? { ...r, status: "completed" as const } : r
        ));
      }
    });
  };

  const renderReleaseGroup = (release: Release | "unassigned", releaseRuns: RunWithStats[]) => {
    const isUnassigned = release === "unassigned";
    const id = isUnassigned ? "unassigned" : release.id;
    const name = isUnassigned ? "Unassigned" : release.name;
    const status = isUnassigned ? null : release.status;
    const isExpanded = expandedReleases.has(id);

    return (
      <div key={id} className="border-b border-border last:border-b-0">
        {/* Release Header */}
        <div
          className={cn(
            "flex items-center justify-between p-4 cursor-pointer transition-colors border-l-4",
            isUnassigned
              ? "border-l-transparent bg-muted/40 hover:bg-muted/60"
              : "border-l-brand-500 bg-gradient-to-r from-brand-50 to-transparent dark:from-brand-950/30 dark:to-transparent hover:from-brand-100 dark:hover:from-brand-950/50"
          )}
          onClick={() => toggleExpand(id)}
        >
          <div className="flex items-center gap-3">
            <ChevronIcon
              className={cn(
                "w-4 h-4 transition-transform",
                isUnassigned ? "text-muted-foreground" : "text-brand-600 dark:text-brand-400",
                isExpanded && "rotate-90"
              )}
            />
            <div className="flex items-center gap-2">
              {!isUnassigned && <ReleaseIcon className="w-4 h-4 text-brand-600 dark:text-brand-400" />}
              <span className={cn(
                "font-semibold",
                isUnassigned ? "text-muted-foreground" : "text-foreground"
              )}>
                {name}
              </span>
              <Badge variant="secondary" className="font-normal">
                {releaseRuns.length} run{releaseRuns.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </div>

          {!isUnassigned && (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {status === "active" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCompleteRelease(release.id)}
                  disabled={isPending}
                  className="h-7 text-xs"
                >
                  <CheckIcon className="w-3 h-3 mr-1" />
                  Complete
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleReopenRelease(release.id)}
                  disabled={isPending}
                  className="h-7 text-xs"
                >
                  <RefreshIcon className="w-3 h-3 mr-1" />
                  Reopen
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Release Runs */}
        {isExpanded && (
          <div className="bg-background">
            {releaseRuns.length === 0 ? (
              <div className="py-8 px-4 text-center text-muted-foreground text-sm">
                No runs in this release
              </div>
            ) : (
              <div className="divide-y divide-border">
                {releaseRuns.map((run) => (
                  <RunRow key={run.id} run={run} linearWorkspace={linearWorkspace} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const currentReleases = activeTab === "active" ? activeReleases : completedReleases;
  const unassignedRuns = runsByRelease.get("unassigned") || [];

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("active")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "active"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Active
          <Badge variant="secondary" className="ml-2">
            {activeReleases.length}
          </Badge>
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "completed"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Completed
          <Badge variant="secondary" className="ml-2">
            {completedReleases.length}
          </Badge>
        </button>
      </div>

      {/* Content */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base font-medium">
            {activeTab === "active" ? "Active Releases" : "Completed Releases"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 mt-4">
          {currentReleases.length === 0 && (activeTab === "completed" || unassignedRuns.length === 0) ? (
            <div className="py-12 text-center text-muted-foreground">
              No {activeTab} releases
            </div>
          ) : (
            <div>
              {/* Releases */}
              {currentReleases.map(release =>
                renderReleaseGroup(release, runsByRelease.get(release.id) || [])
              )}

              {/* Unassigned runs - show in active tab */}
              {activeTab === "active" && unassignedRuns.length > 0 &&
                renderReleaseGroup("unassigned", unassignedRuns)
              }
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function RunRow({ run, linearWorkspace }: { run: RunWithStats; linearWorkspace?: string }) {
  const passRate = run.total > 0
    ? Math.round(((run.stats.passed || 0) / run.total) * 100)
    : 0;

  return (
    <Link
      href={`/runs/${run.id}`}
      className="flex items-center justify-between p-4 pl-12 hover:bg-muted/50 transition-colors group"
    >
      <div className="min-w-0">
        <div className="font-medium text-foreground group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
          {run.name}
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
          <span>
            {run.createdAt?.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="text-border">·</span>
          <span>{run.total} cases</span>
          {run.linearIssueIdentifier && linearWorkspace && (
            <>
              <span className="text-border">·</span>
              <a
                href={`https://linear.app/${linearWorkspace}/issue/${run.linearIssueIdentifier}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline transition-colors"
              >
                <LinearIcon className="w-3.5 h-3.5" />
                {run.linearIssueIdentifier}
              </a>
            </>
          )}
          {run.linearProjectName && run.linearProjectId && linearWorkspace && (
            <>
              <span className="text-border">·</span>
              <a
                href={`https://linear.app/${linearWorkspace}/project/${run.linearProjectId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline transition-colors"
              >
                <ProjectIcon className="w-3.5 h-3.5" />
                {run.linearProjectName}
              </a>
            </>
          )}
          {run.linearMilestoneName && run.linearMilestoneId && run.linearProjectId && linearWorkspace && (
            <>
              <span className="text-border">·</span>
              <a
                href={`https://linear.app/${linearWorkspace}/project/${run.linearProjectId}#projectTab=milestones`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:text-foreground hover:underline transition-colors"
              >
                <MilestoneIcon className="w-3.5 h-3.5" />
                {run.linearMilestoneName}
              </a>
            </>
          )}
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

        {/* Environment */}
        {run.environment && (
          <span
            className={cn(
              "px-2 py-0.5 text-xs font-medium rounded-full",
              run.environment === "prod"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : run.environment === "staging"
                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                : run.environment === "dev"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
            )}
          >
            {run.environment.charAt(0).toUpperCase() + run.environment.slice(1)}
          </span>
        )}

        {/* Run Status */}
        <Badge variant={run.status === "completed" ? "default" : "warning"}>
          {run.status}
        </Badge>

        <ChevronRightIcon className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
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

function ReleaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function LinearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor">
      <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5964C17.0116 93.5765 3.05765 79.3523 1.22541 61.5228Z" />
      <path d="M98.7746 38.4772c.2225.9485-.9075 1.5459-1.5964.857L60.6658 2.82181c-.6889-.68886-.0915-1.8189.857-1.59639C82.9884 6.42347 96.9423 20.6477 98.7746 38.4772Z" />
      <path d="M38.4772 1.22541c.9485-.2225 1.5459.90748.857 1.59638L2.82181 39.3342c-.68886.6889-1.8189.0915-1.59639-.857C6.42347 17.0116 20.6477 3.05765 38.4772 1.22541Z" />
      <path d="M61.5228 98.7746c-.9485.2225-1.5459-.9075-.857-1.5964l36.5125-36.5124c.6889-.6889 1.8189-.0915 1.5964.857-5.1981 21.4608-19.4223 35.4146-37.2519 37.2518Z" />
    </svg>
  );
}

function ProjectIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function MilestoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  );
}
