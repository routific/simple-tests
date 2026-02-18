"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ReleasePicker } from "@/components/release-picker";
import { TestRunRow, type TestRunData } from "@/components/test-run-row";
import { completeRelease, reopenRelease, updateRelease } from "@/app/releases/actions";
import { duplicateTestRun, deleteTestRun } from "@/app/runs/actions";

type RunWithStats = TestRunData;

interface Release {
  id: number;
  name: string;
  status: "active" | "completed";
  linearLabelId: string | null;
}

interface RunsListProps {
  runs: RunWithStats[];
  releases: Release[];
  linearWorkspace?: string;
  initialReleaseId?: number | null;
}

export function RunsList({ runs, releases, linearWorkspace, initialReleaseId }: RunsListProps) {
  const router = useRouter();

  // Determine initial tab based on the linked release
  const getInitialTab = () => {
    if (initialReleaseId) {
      const release = releases.find(r => r.id === initialReleaseId);
      if (release) {
        return release.status === "completed" ? "completed" : "active";
      }
    }
    return "active";
  };

  const [activeTab, setActiveTab] = useState<"active" | "completed">(getInitialTab);
  const [expandedReleases, setExpandedReleases] = useState<Set<number | "unassigned">>(() => {
    const ids: (number | "unassigned")[] = ["unassigned", ...releases.filter(r => r.status === "active").map(r => r.id)];
    // Also expand the initial release if provided
    if (initialReleaseId && !ids.includes(initialReleaseId)) {
      ids.push(initialReleaseId);
    }
    return new Set(ids);
  });

  // Track which release URL was copied
  const [copiedReleaseId, setCopiedReleaseId] = useState<number | null>(null);

  // Refs for scrolling to release
  const releaseRefs = useRef<Map<number | "unassigned", HTMLDivElement>>(new Map());
  const [isPending, startTransition] = useTransition();
  const [optimisticReleases, setOptimisticReleases] = useState(releases);

  // Search state for completed releases
  const [searchQuery, setSearchQuery] = useState("");

  // Duplicate modal state
  const [duplicateRun, setDuplicateRun] = useState<RunWithStats | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicateReleaseId, setDuplicateReleaseId] = useState<number | null>(null);
  const [duplicateEnvironment, setDuplicateEnvironment] = useState<"sandbox" | "dev" | "staging" | "prod" | null>(null);

  // Release edit state
  const [editingReleaseId, setEditingReleaseId] = useState<number | null>(null);
  const [editingReleaseName, setEditingReleaseName] = useState("");

  // Scroll to initial release on mount
  useEffect(() => {
    if (initialReleaseId) {
      // Small delay to ensure refs are set
      setTimeout(() => {
        const el = releaseRefs.current.get(initialReleaseId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
    }
  }, [initialReleaseId]);

  const copyReleaseUrl = (release: Release) => {
    const slug = release.linearLabelId || release.id;
    const url = `${window.location.origin}/releases/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedReleaseId(release.id);
    setTimeout(() => setCopiedReleaseId(null), 2000);
  };

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

  const handleOpenDuplicate = (run: RunWithStats) => {
    setDuplicateRun(run);
    setDuplicateName(run.name);
    setDuplicateReleaseId(run.releaseId);
    setDuplicateEnvironment(run.environment);
  };

  const handleCloseDuplicate = () => {
    setDuplicateRun(null);
    setDuplicateName("");
    setDuplicateReleaseId(null);
    setDuplicateEnvironment(null);
  };

  const handleDuplicate = () => {
    if (!duplicateRun || !duplicateName.trim()) return;

    const selectedReleaseName = optimisticReleases.find(r => r.id === duplicateReleaseId)?.name || null;

    startTransition(async () => {
      const result = await duplicateTestRun({
        sourceRunId: duplicateRun.id,
        name: duplicateName.trim(),
        releaseId: duplicateReleaseId,
        releaseName: selectedReleaseName,
        environment: duplicateEnvironment,
      });

      if (result.success) {
        handleCloseDuplicate();
        router.refresh();
      }
    });
  };

  const handleDelete = (run: RunWithStats) => {
    if (!confirm(`Delete "${run.name}"? This cannot be undone.`)) return;

    startTransition(async () => {
      const result = await deleteTestRun(run.id);
      if (result.success) {
        router.refresh();
      } else if (result.error) {
        alert(`Failed to delete: ${result.error}`);
      }
    });
  };

  const handleStartEditRelease = (release: Release) => {
    setEditingReleaseId(release.id);
    setEditingReleaseName(release.name);
  };

  const handleCancelEditRelease = () => {
    setEditingReleaseId(null);
    setEditingReleaseName("");
  };

  const handleSaveReleaseName = (releaseId: number) => {
    if (!editingReleaseName.trim()) return;

    // Optimistic update
    const oldName = optimisticReleases.find(r => r.id === releaseId)?.name;
    setOptimisticReleases(prev => prev.map(r =>
      r.id === releaseId ? { ...r, name: editingReleaseName.trim() } : r
    ));
    setEditingReleaseId(null);
    setEditingReleaseName("");

    startTransition(async () => {
      const result = await updateRelease(releaseId, editingReleaseName.trim());
      if (result.error && oldName) {
        // Revert on error
        setOptimisticReleases(prev => prev.map(r =>
          r.id === releaseId ? { ...r, name: oldName } : r
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
      <div
        key={id}
        ref={(el) => {
          if (el && !isUnassigned) releaseRefs.current.set(id, el);
        }}
        className="border-b border-border last:border-b-0"
      >
        {/* Release Header */}
        <div
          className={cn(
            "group flex items-center justify-between p-4 cursor-pointer transition-colors border-l-4",
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
              {!isUnassigned && editingReleaseId === release.id ? (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Input
                    type="text"
                    value={editingReleaseName}
                    onChange={(e) => setEditingReleaseName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSaveReleaseName(release.id);
                      } else if (e.key === "Escape") {
                        handleCancelEditRelease();
                      }
                    }}
                    className="h-7 w-48 text-sm"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleSaveReleaseName(release.id)}
                    disabled={isPending || !editingReleaseName.trim()}
                    className="h-7 w-7 p-0"
                  >
                    <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelEditRelease}
                    className="h-7 w-7 p-0"
                  >
                    <CloseIcon className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className={cn(
                    "font-semibold",
                    isUnassigned ? "text-muted-foreground" : "text-foreground"
                  )}>
                    {name}
                  </span>
                  {!isUnassigned && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEditRelease(release);
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Edit release name"
                      >
                        <EditIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyReleaseUrl(release);
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copy link to release"
                      >
                        {copiedReleaseId === release.id ? (
                          <CheckIcon className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <LinkIcon className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <Link
                        href={`/releases/${release.linearLabelId || release.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        title="View release details"
                      >
                        <OpenIcon className="w-3.5 h-3.5" />
                      </Link>
                    </>
                  )}
                </>
              )}
              <Badge variant="secondary" className="font-normal">
                {releaseRuns.length} run{releaseRuns.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </div>

          {!isUnassigned && editingReleaseId !== release.id && (
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
                  <TestRunRow
                    key={run.id}
                    run={run}
                    linearWorkspace={linearWorkspace}
                    showActions
                    onDuplicate={() => handleOpenDuplicate(run)}
                    onDelete={() => handleDelete(run)}
                    className="pl-12"
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Filter completed releases by search query
  const filteredCompletedReleases = searchQuery
    ? completedReleases.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : completedReleases;

  const currentReleases = activeTab === "active" ? activeReleases : filteredCompletedReleases;
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">
              {activeTab === "active" ? "Active Releases" : "Completed Releases"}
            </CardTitle>
            {activeTab === "completed" && (
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search releases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 w-48"
                />
              </div>
            )}
          </div>
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

      {/* Duplicate Run Modal */}
      {duplicateRun && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md border border-border ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold">Duplicate Run</h2>
              <button
                onClick={handleCloseDuplicate}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Create a new run with the same {duplicateRun.total} scenario{duplicateRun.total !== 1 ? "s" : ""}, all reset to pending status.
              </p>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1.5">Name</label>
                <Input
                  type="text"
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  placeholder="Run name"
                />
              </div>

              {/* Release */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Release <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <ReleasePicker
                  releases={optimisticReleases}
                  value={duplicateReleaseId}
                  onChange={setDuplicateReleaseId}
                  onReleaseCreated={(newRelease) => {
                    setOptimisticReleases(prev => [...prev, newRelease]);
                  }}
                  placeholder="No release"
                  className="w-full"
                />
              </div>

              {/* Environment */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Environment <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <div className="flex gap-2">
                  {(["sandbox", "dev", "staging", "prod"] as const).map((env) => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => setDuplicateEnvironment(duplicateEnvironment === env ? null : env)}
                      className={cn(
                        "px-3 py-1.5 text-sm font-medium rounded-full border transition-colors",
                        duplicateEnvironment === env
                          ? env === "prod"
                            ? "bg-green-100 border-green-300 text-green-700 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400"
                            : env === "staging"
                            ? "bg-yellow-100 border-yellow-300 text-yellow-700 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-400"
                            : env === "dev"
                            ? "bg-blue-100 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400"
                            : "bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300"
                          : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {env.charAt(0).toUpperCase() + env.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={handleCloseDuplicate}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicate}
                disabled={isPending || !duplicateName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-md hover:bg-brand-600 disabled:opacity-50"
              >
                {isPending ? "Creating..." : "Create Duplicate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
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

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  );
}

function OpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}

