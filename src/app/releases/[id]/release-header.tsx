"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeRelease, reopenRelease, updateRelease, deleteRelease } from "../actions";

interface ReleaseSummary {
  totalRuns: number;
  totalScenarios: number;
  passed: number;
  failed: number;
  pending: number;
  blocked: number;
  skipped: number;
}

interface ReleaseHeaderProps {
  release: {
    id: number;
    name: string;
    status: "active" | "completed";
    linearLabelId: string | null;
  };
  summary?: ReleaseSummary;
}

export function ReleaseHeader({ release, summary }: ReleaseHeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(release.name);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  const fireConfetti = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);
  };

  const handleComplete = () => {
    startTransition(async () => {
      const result = await completeRelease(release.id);
      if (!result.error) {
        setShowCompleteModal(false);
        fireConfetti();
        router.refresh();
      }
    });
  };

  const passRate = summary && summary.totalScenarios > 0
    ? Math.round((summary.passed / summary.totalScenarios) * 100)
    : 0;

  const handleReopen = () => {
    startTransition(async () => {
      await reopenRelease(release.id);
      router.refresh();
    });
  };

  const handleSave = () => {
    if (!editName.trim() || editName.trim() === release.name) {
      setIsEditing(false);
      setEditName(release.name);
      return;
    }

    startTransition(async () => {
      const result = await updateRelease(release.id, editName.trim());
      if (result.success) {
        setIsEditing(false);
        router.refresh();
      } else {
        setEditName(release.name);
        setIsEditing(false);
      }
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete "${release.name}"? Test runs will be moved to Unassigned.`)) return;

    startTransition(async () => {
      const result = await deleteRelease(release.id);
      if (result.success) {
        router.push("/releases");
      } else {
        alert(`Failed to delete: ${result.error}`);
      }
    });
  };

  const handleCopyLink = () => {
    // Use release name for the URL (URL-encoded)
    const url = `${window.location.origin}/releases/${encodeURIComponent(release.name)}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // Synced releases cannot be edited (name comes from Linear)
  const isSynced = !!release.linearLabelId;

  return (
    <>
      {/* Back link */}
      <Link
        href="/releases"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 inline-flex items-center gap-1"
      >
        <ChevronLeftIcon className="w-4 h-4" />
        All Releases
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-8 mt-2">
        <div className="flex items-center gap-3">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") {
                    setIsEditing(false);
                    setEditName(release.name);
                  }
                }}
                className="text-2xl font-semibold h-10 w-64"
                autoFocus
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSave}
                disabled={isPending}
                className="h-8 w-8 p-0"
              >
                <CheckIcon className="w-4 h-4 text-emerald-600" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditName(release.name);
                }}
                className="h-8 w-8 p-0"
              >
                <CloseIcon className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                {release.name}
              </h1>
              <Badge variant={release.status === "active" ? "default" : "secondary"}>
                {release.status}
              </Badge>
              {release.linearLabelId && (
                <span className="text-xs text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded-full">
                  Synced from Linear
                </span>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        {!isEditing && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopyLink}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Copy link to release"
            >
              {linkCopied ? (
                <CheckIcon className="w-4 h-4 text-emerald-600" />
              ) : (
                <LinkIcon className="w-4 h-4" />
              )}
            </button>
            {!isSynced && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                title="Edit release"
              >
                <EditIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
              title="Delete release"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
            {release.status === "active" ? (
              <Button
                onClick={() => setShowCompleteModal(true)}
                disabled={isPending}
                className="ml-2"
              >
                <CheckIcon className="w-4 h-4" />
                Complete Release
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleReopen}
                disabled={isPending}
                className="ml-2"
              >
                <RefreshIcon className="w-4 h-4" />
                {isPending ? "Reopening..." : "Reopen"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Complete Release Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md border border-border ring-1 ring-black/5 dark:ring-white/10 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <PartyIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Complete Release</h2>
                  <p className="text-sm text-muted-foreground">{release.name}</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {summary && summary.totalRuns > 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Ready to mark this release as complete? Here&apos;s a summary:
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-foreground">{summary.totalRuns}</div>
                      <div className="text-xs text-muted-foreground">Test Runs</div>
                    </div>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <div className="text-2xl font-bold text-foreground">{summary.totalScenarios}</div>
                      <div className="text-xs text-muted-foreground">Total Scenarios</div>
                    </div>
                  </div>

                  {summary.totalScenarios > 0 && (
                    <div className="bg-muted/50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Overall Pass Rate</span>
                        <span className={cn(
                          "text-lg font-bold",
                          passRate >= 80 ? "text-emerald-600" : passRate >= 50 ? "text-yellow-600" : "text-red-600"
                        )}>
                          {passRate}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full transition-all duration-500",
                            passRate >= 80 ? "bg-emerald-500" : passRate >= 50 ? "bg-yellow-500" : "bg-red-500"
                          )}
                          style={{ width: `${passRate}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {summary.passed > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-sm rounded-full">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        {summary.passed} passed
                      </span>
                    )}
                    {summary.failed > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm rounded-full">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        {summary.failed} failed
                      </span>
                    )}
                    {summary.pending > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400 text-sm rounded-full">
                        <span className="w-2 h-2 rounded-full bg-gray-400" />
                        {summary.pending} pending
                      </span>
                    )}
                    {summary.blocked > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-sm rounded-full">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        {summary.blocked} blocked
                      </span>
                    )}
                    {summary.skipped > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 text-sm rounded-full">
                        <span className="w-2 h-2 rounded-full bg-gray-300" />
                        {summary.skipped} skipped
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to mark this release as complete?
                </p>
              )}
            </div>

            <div className="p-4 border-t border-border flex items-center justify-end gap-2 bg-muted/30">
              <Button
                variant="ghost"
                onClick={() => setShowCompleteModal(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleComplete}
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isPending ? (
                  <>
                    <SpinnerIcon className="w-4 h-4 animate-spin" />
                    Completing...
                  </>
                ) : (
                  <>
                    <PartyIcon className="w-4 h-4" />
                    Complete Release
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function PartyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.125-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
