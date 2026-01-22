"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { GherkinDisplay } from "./gherkin-editor";
import { updateTestResult, completeTestRun, deleteTestRun } from "@/app/runs/actions";
import type { TestRun } from "@/lib/db/schema";

interface Result {
  id: number;
  status: string;
  notes: string | null;
  executedAt: Date | null;
  scenarioId: number;
  scenarioTitle: string;
  scenarioGherkin: string;
  testCaseId: number;
  testCaseTitle: string;
  folderName: string | null;
}

interface Props {
  run: TestRun;
  results: Result[];
}

export function RunExecutor({ run, results }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedResult, setSelectedResult] = useState<Result | null>(
    results.find((r) => r.status === "pending") || results[0] || null
  );
  const [notes, setNotes] = useState("");

  const stats = {
    total: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    pending: results.filter((r) => r.status === "pending").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };

  const passRate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;

  const handleStatusUpdate = (status: "passed" | "failed" | "blocked" | "skipped") => {
    if (!selectedResult) return;

    startTransition(async () => {
      await updateTestResult({
        resultId: selectedResult.id,
        status,
        notes: notes.trim() || undefined,
      });

      // Move to next pending case
      const currentIndex = results.findIndex((r) => r.id === selectedResult.id);
      const nextPending = results.find((r, i) => i > currentIndex && r.status === "pending");
      if (nextPending) {
        setSelectedResult(nextPending);
        setNotes("");
      }

      router.refresh();
    });
  };

  const handleComplete = () => {
    startTransition(async () => {
      await completeTestRun(run.id);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!confirm("Delete this test run? This cannot be undone.")) return;

    startTransition(async () => {
      await deleteTestRun(run.id);
      router.push("/runs");
    });
  };

  return (
    <>
      <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/runs"
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <BackIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold">{run.name}</h1>
            <div className="text-sm text-[hsl(var(--muted-foreground))] flex items-center gap-3">
              <span>{run.createdAt?.toLocaleDateString()}</span>
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
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
          >
            Delete
          </button>
          {run.status === "in_progress" && (
            <button
              onClick={handleComplete}
              disabled={isPending}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:opacity-90 disabled:opacity-50"
            >
              Complete Run
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="p-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-green-500" style={{ width: `${passRate}%` }} />
            </div>
            <span className="text-sm font-medium">{passRate}% passed</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-green-600">{stats.passed} passed</span>
            <span className="text-red-600">{stats.failed} failed</span>
            <span className="text-gray-600">{stats.pending} pending</span>
            {stats.blocked > 0 && <span className="text-orange-600">{stats.blocked} blocked</span>}
            {stats.skipped > 0 && <span className="text-gray-400">{stats.skipped} skipped</span>}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Scenario list */}
        <div className="w-80 border-r border-[hsl(var(--border))] overflow-auto">
          {results.map((result) => (
            <button
              key={result.id}
              onClick={() => {
                setSelectedResult(result);
                setNotes(result.notes || "");
              }}
              className={cn(
                "w-full text-left p-3 border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]",
                selectedResult?.id === result.id && "bg-[hsl(var(--muted))]"
              )}
            >
              <div className="flex items-center gap-2">
                <StatusIcon status={result.status} />
                <span className="font-medium truncate flex-1">{result.scenarioTitle}</span>
              </div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1 ml-6">
                {result.testCaseTitle}
                {result.folderName && ` • ${result.folderName}`}
              </div>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-auto p-4">
          {selectedResult ? (
            <div className="max-w-3xl">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-sm text-[hsl(var(--muted-foreground))] mb-1">
                    {selectedResult.testCaseTitle}
                  </div>
                  <h2 className="text-lg font-medium">{selectedResult.scenarioTitle}</h2>
                  {selectedResult.folderName && (
                    <div className="text-sm text-[hsl(var(--muted-foreground))]">
                      {selectedResult.folderName}
                    </div>
                  )}
                </div>
                <Link
                  href={`/cases/${selectedResult.testCaseId}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View case
                </Link>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-medium mb-2">Steps</h3>
                <GherkinDisplay text={selectedResult.scenarioGherkin} />
              </div>

              {run.status === "in_progress" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any notes about this test..."
                      className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStatusUpdate("passed")}
                      disabled={isPending}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:opacity-90 disabled:opacity-50"
                    >
                      Pass
                    </button>
                    <button
                      onClick={() => handleStatusUpdate("failed")}
                      disabled={isPending}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:opacity-90 disabled:opacity-50"
                    >
                      Fail
                    </button>
                    <button
                      onClick={() => handleStatusUpdate("blocked")}
                      disabled={isPending}
                      className="px-4 py-2 text-sm font-medium text-orange-600 border border-orange-600 rounded-md hover:bg-orange-50 disabled:opacity-50"
                    >
                      Blocked
                    </button>
                    <button
                      onClick={() => handleStatusUpdate("skipped")}
                      disabled={isPending}
                      className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              )}

              {selectedResult.notes && run.status === "completed" && (
                <div className="mt-4 p-3 bg-[hsl(var(--muted))] rounded-md">
                  <div className="text-sm font-medium mb-1">Notes</div>
                  <div className="text-sm">{selectedResult.notes}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-[hsl(var(--muted-foreground))] py-12">
              Select a test case to view details
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "passed") {
    return (
      <div className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  }
  if (status === "blocked") {
    return <div className="w-5 h-5 rounded-full bg-orange-100 border-2 border-orange-400" />;
  }
  if (status === "skipped") {
    return <div className="w-5 h-5 rounded-full bg-gray-100 border-2 border-gray-300" />;
  }
  return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}
