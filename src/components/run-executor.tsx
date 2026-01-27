"use client";

import { useState, useTransition, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { GherkinDisplay } from "./gherkin-editor";
import { ReleasePicker } from "./release-picker";
import { Input } from "./ui/input";
import { updateTestResult, completeTestRun, deleteTestRun, updateTestRun, addScenariosToRun, removeScenariosFromRun } from "@/app/runs/actions";
import type { TestRun } from "@/lib/db/schema";

interface LinearProject {
  id: string;
  name: string;
  state: string;
}

interface LinearMilestone {
  id: string;
  name: string;
  targetDate?: string;
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  state: { name: string; color: string };
}

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

interface Release {
  id: number;
  name: string;
  status: "active" | "completed";
}

interface AvailableScenario {
  id: number;
  title: string;
  testCaseId: number;
  testCaseTitle: string;
  folderName: string | null;
}

interface Props {
  run: TestRun;
  results: Result[];
  releases: Release[];
  availableScenarios: AvailableScenario[];
  linearWorkspace?: string;
}

export function RunExecutor({ run, results, releases: initialReleases, availableScenarios, linearWorkspace }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedResult, setSelectedResult] = useState<Result | null>(
    results.find((r) => r.status === "pending") || results[0] || null
  );
  const [notes, setNotes] = useState("");

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(run.name);
  const [editReleaseId, setEditReleaseId] = useState<number | null>(run.releaseId);
  const [releases, setReleases] = useState<Release[]>(initialReleases);
  const [showAddScenarios, setShowAddScenarios] = useState(false);
  const [scenarioSearch, setScenarioSearch] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState<Set<number>>(new Set());
  const [selectedToRemove, setSelectedToRemove] = useState<Set<number>>(new Set());

  // Linear edit state
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [milestones, setMilestones] = useState<LinearMilestone[]>([]);
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [editProject, setEditProject] = useState<LinearProject | null>(
    run.linearProjectId && run.linearProjectName
      ? { id: run.linearProjectId, name: run.linearProjectName, state: "" }
      : null
  );
  const [editMilestone, setEditMilestone] = useState<LinearMilestone | null>(
    run.linearMilestoneId && run.linearMilestoneName
      ? { id: run.linearMilestoneId, name: run.linearMilestoneName }
      : null
  );
  const [editIssue, setEditIssue] = useState<LinearIssue | null>(
    run.linearIssueId && run.linearIssueIdentifier
      ? { id: run.linearIssueId, identifier: run.linearIssueIdentifier, title: run.linearIssueTitle || "", state: { name: "", color: "" } }
      : null
  );
  const [issueSearch, setIssueSearch] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);

  // Get scenario IDs already in this run
  const existingScenarioIds = useMemo(() => new Set(results.map(r => r.scenarioId)), [results]);

  // Filter available scenarios that aren't already in the run
  const filteredAvailable = useMemo(() => {
    return availableScenarios
      .filter(s => !existingScenarioIds.has(s.id))
      .filter(s => {
        if (!scenarioSearch) return true;
        const search = scenarioSearch.toLowerCase();
        return s.title.toLowerCase().includes(search) ||
          s.testCaseTitle.toLowerCase().includes(search) ||
          (s.folderName?.toLowerCase().includes(search) ?? false);
      });
  }, [availableScenarios, existingScenarioIds, scenarioSearch]);

  const stats = {
    total: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    pending: results.filter((r) => r.status === "pending").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };

  const passRate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;

  // Fetch Linear projects when entering edit mode
  useEffect(() => {
    if (!isEditing) return;
    async function fetchProjects() {
      setLoadingProjects(true);
      try {
        const res = await fetch("/api/linear/projects");
        if (res.ok) {
          const data = await res.json();
          setProjects(data);
        }
      } catch (e) {
        console.error("Failed to fetch projects:", e);
      } finally {
        setLoadingProjects(false);
      }
    }
    fetchProjects();
  }, [isEditing]);

  // Fetch milestones when project changes
  useEffect(() => {
    if (!isEditing) return;
    async function fetchMilestones() {
      if (!editProject) {
        setMilestones([]);
        return;
      }
      setLoadingMilestones(true);
      try {
        const res = await fetch(`/api/linear/milestones?projectId=${editProject.id}`);
        if (res.ok) {
          const data = await res.json();
          setMilestones(data);
        }
      } catch (e) {
        console.error("Failed to fetch milestones:", e);
      } finally {
        setLoadingMilestones(false);
      }
    }
    fetchMilestones();
  }, [isEditing, editProject]);

  // Debounced issue search
  const searchIssues = useCallback(async (search: string) => {
    if (!search.trim()) {
      setIssues([]);
      return;
    }
    setLoadingIssues(true);
    try {
      const res = await fetch(`/api/linear/issues?q=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setIssues(data);
      }
    } catch (e) {
      console.error("Failed to fetch issues:", e);
    } finally {
      setLoadingIssues(false);
    }
  }, []);

  useEffect(() => {
    if (!isEditing || editIssue) return;
    const timer = setTimeout(() => {
      searchIssues(issueSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [issueSearch, searchIssues, isEditing, editIssue]);

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

  const handleSaveEdit = () => {
    if (!editName.trim()) return;

    startTransition(async () => {
      await updateTestRun({
        runId: run.id,
        name: editName.trim(),
        releaseId: editReleaseId,
        linearProjectId: editProject?.id || null,
        linearProjectName: editProject?.name || null,
        linearMilestoneId: editMilestone?.id || null,
        linearMilestoneName: editMilestone?.name || null,
        linearIssueId: editIssue?.id || null,
        linearIssueIdentifier: editIssue?.identifier || null,
        linearIssueTitle: editIssue?.title || null,
      });
      setIsEditing(false);
      router.refresh();
    });
  };

  const handleCancelEdit = () => {
    setEditName(run.name);
    setEditReleaseId(run.releaseId);
    setEditProject(
      run.linearProjectId && run.linearProjectName
        ? { id: run.linearProjectId, name: run.linearProjectName, state: "" }
        : null
    );
    setEditMilestone(
      run.linearMilestoneId && run.linearMilestoneName
        ? { id: run.linearMilestoneId, name: run.linearMilestoneName }
        : null
    );
    setEditIssue(
      run.linearIssueId && run.linearIssueIdentifier
        ? { id: run.linearIssueId, identifier: run.linearIssueIdentifier, title: run.linearIssueTitle || "", state: { name: "", color: "" } }
        : null
    );
    setIssueSearch("");
    setIsEditing(false);
  };

  const handleAddScenarios = () => {
    if (selectedToAdd.size === 0) return;

    startTransition(async () => {
      await addScenariosToRun({
        runId: run.id,
        scenarioIds: Array.from(selectedToAdd),
      });
      setSelectedToAdd(new Set());
      setShowAddScenarios(false);
      setScenarioSearch("");
      router.refresh();
    });
  };

  const handleRemoveScenarios = () => {
    if (selectedToRemove.size === 0) return;

    if (!confirm(`Remove ${selectedToRemove.size} scenario(s) from this run?`)) return;

    startTransition(async () => {
      await removeScenariosFromRun({
        runId: run.id,
        resultIds: Array.from(selectedToRemove),
      });
      setSelectedToRemove(new Set());
      if (selectedResult && selectedToRemove.has(selectedResult.id)) {
        setSelectedResult(null);
      }
      router.refresh();
    });
  };

  const toggleAddSelection = (scenarioId: number) => {
    setSelectedToAdd(prev => {
      const next = new Set(prev);
      if (next.has(scenarioId)) {
        next.delete(scenarioId);
      } else {
        next.add(scenarioId);
      }
      return next;
    });
  };

  const toggleRemoveSelection = (resultId: number) => {
    setSelectedToRemove(prev => {
      const next = new Set(prev);
      if (next.has(resultId)) {
        next.delete(resultId);
      } else {
        next.add(resultId);
      }
      return next;
    });
  };

  const selectedRelease = releases.find(r => r.id === run.releaseId);

  return (
    <>
      <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link
            href="/runs"
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <BackIcon className="w-5 h-5" />
          </Link>
          {isEditing ? (
            <div className="flex flex-col gap-3 flex-1">
              <div className="flex items-center gap-3">
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-64"
                  placeholder="Run name"
                />
                <ReleasePicker
                  releases={releases}
                  value={editReleaseId}
                  onChange={setEditReleaseId}
                  onReleaseCreated={(newRelease) => {
                    setReleases(prev => [...prev, newRelease]);
                  }}
                  placeholder="No release"
                  className="w-48"
                />
                <button
                  onClick={handleSaveEdit}
                  disabled={isPending || !editName.trim()}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-brand-500 rounded-md hover:bg-brand-600 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isPending}
                  className="px-3 py-1.5 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  Cancel
                </button>
              </div>
              {/* Linear Integration */}
              <div className="border border-[hsl(var(--border))] rounded-lg p-3 bg-[hsl(var(--muted))]/30">
                <div className="flex items-center gap-2 mb-3">
                  <LinearIcon className="w-4 h-4 text-brand-600" />
                  <span className="text-sm font-medium">Linear Integration</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">(optional)</span>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* Project Selector */}
                  <div>
                    <label className="block text-sm text-[hsl(var(--muted-foreground))] mb-1.5">
                      Project
                    </label>
                    <select
                      value={editProject?.id || ""}
                      onChange={(e) => {
                        const proj = projects.find(p => p.id === e.target.value);
                        setEditProject(proj || null);
                        setEditMilestone(null);
                      }}
                      disabled={loadingProjects}
                      className="w-full px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors disabled:opacity-50"
                    >
                      <option value="">None</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Milestone Selector */}
                  <div>
                    <label className="block text-sm text-[hsl(var(--muted-foreground))] mb-1.5">
                      Milestone
                    </label>
                    <select
                      value={editMilestone?.id || ""}
                      onChange={(e) => {
                        const ms = milestones.find(m => m.id === e.target.value);
                        setEditMilestone(ms || null);
                      }}
                      disabled={!editProject || loadingMilestones}
                      className="w-full px-3 py-2 text-sm border border-[hsl(var(--border))] rounded-lg bg-[hsl(var(--background))] focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-colors disabled:opacity-50"
                    >
                      <option value="">None</option>
                      {milestones.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Issue Selector with Search */}
                  <div>
                    <label className="block text-sm text-[hsl(var(--muted-foreground))] mb-1.5">
                      Link to Issue
                    </label>
                    <div className="relative">
                      <Input
                        type="text"
                        value={editIssue ? `${editIssue.identifier}: ${editIssue.title}` : issueSearch}
                        onChange={(e) => {
                          if (editIssue) {
                            setEditIssue(null);
                            setIssueSearch(e.target.value);
                          } else {
                            setIssueSearch(e.target.value);
                          }
                        }}
                        placeholder="Search issues..."
                        className="pr-8"
                      />
                      {editIssue && (
                        <button
                          onClick={() => {
                            setEditIssue(null);
                            setIssueSearch("");
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                        >
                          <CloseIcon className="w-4 h-4" />
                        </button>
                      )}
                      {loadingIssues && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                          <LoadingIcon className="w-4 h-4 animate-spin text-[hsl(var(--muted-foreground))]" />
                        </div>
                      )}
                      {/* Issue dropdown */}
                      {!editIssue && issueSearch && issues.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-lg shadow-lg max-h-48 overflow-auto">
                          {issues.map(issue => (
                            <button
                              key={issue.id}
                              onClick={() => {
                                setEditIssue(issue);
                                setIssueSearch("");
                                setIssues([]);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-[hsl(var(--muted))] transition-colors flex items-center gap-2"
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: issue.state.color }}
                              />
                              <span className="font-medium text-sm">{issue.identifier}</span>
                              <span className="text-sm text-[hsl(var(--muted-foreground))] truncate">
                                {issue.title}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h1 className="text-xl font-semibold">{run.name}</h1>
              <div className="text-sm text-[hsl(var(--muted-foreground))] flex items-center gap-3 flex-wrap">
                <span>{run.createdAt?.toLocaleDateString()}</span>
                {selectedRelease && (
                  <>
                    <span className="text-border">·</span>
                    <span>{selectedRelease.name}</span>
                  </>
                )}
                {run.linearIssueIdentifier && linearWorkspace && (
                  <>
                    <span className="text-border">·</span>
                    <a
                      href={`https://linear.app/${linearWorkspace}/issue/${run.linearIssueIdentifier}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-[hsl(var(--foreground))] hover:underline transition-colors"
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
                      className="inline-flex items-center gap-1 hover:text-[hsl(var(--foreground))] hover:underline transition-colors"
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
                      className="inline-flex items-center gap-1 hover:text-[hsl(var(--foreground))] hover:underline transition-colors"
                    >
                      <MilestoneIcon className="w-3.5 h-3.5" />
                      {run.linearMilestoneName}
                    </a>
                  </>
                )}
                <span
                  className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded",
                    run.status === "completed"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                      : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                  )}
                >
                  {run.status}
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isEditing && (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded-md transition-colors"
                title="Edit run"
              >
                <EditIcon className="w-4 h-4" />
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="p-2 text-[hsl(var(--muted-foreground))] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
                title="Delete run"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </>
          )}
          {run.status === "in_progress" && !isEditing && (
            <button
              onClick={handleComplete}
              disabled={isPending}
              className="ml-2 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:opacity-90 disabled:opacity-50"
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
              <div className="h-full bg-emerald-400" style={{ width: `${passRate}%` }} />
            </div>
            <span className="text-sm font-medium">{passRate}% passed</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-emerald-600">{stats.passed} passed</span>
            <span className="text-rose-500">{stats.failed} failed</span>
            <span className="text-gray-600">{stats.pending} pending</span>
            {stats.blocked > 0 && <span className="text-orange-600">{stats.blocked} blocked</span>}
            {stats.skipped > 0 && <span className="text-gray-400">{stats.skipped} skipped</span>}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Scenario list */}
        <div className="w-80 border-r border-[hsl(var(--border))] overflow-auto flex flex-col">
          {/* List header with actions */}
          {run.status === "in_progress" && (
            <div className="p-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] flex items-center justify-between gap-2">
              {selectedToRemove.size > 0 ? (
                <>
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">
                    {selectedToRemove.size} selected
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedToRemove(new Set())}
                      className="px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRemoveScenarios}
                      disabled={isPending}
                      className="px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium">{results.length} scenarios</span>
                  <button
                    onClick={() => setShowAddScenarios(true)}
                    className="px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded flex items-center gap-1"
                  >
                    <PlusIcon className="w-3 h-3" />
                    Add
                  </button>
                </>
              )}
            </div>
          )}

          {/* Scenario list */}
          <div className="flex-1 overflow-auto">
            {results.map((result) => (
              <div
                key={result.id}
                className={cn(
                  "w-full text-left p-3 border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] flex items-start gap-2",
                  selectedResult?.id === result.id && "bg-[hsl(var(--muted))]"
                )}
              >
                {run.status === "in_progress" && isEditing && (
                  <input
                    type="checkbox"
                    checked={selectedToRemove.has(result.id)}
                    onChange={() => toggleRemoveSelection(result.id)}
                    className="mt-1 rounded border-gray-300"
                  />
                )}
                <button
                  onClick={() => {
                    setSelectedResult(result);
                    setNotes(result.notes || "");
                  }}
                  className="flex-1 text-left min-w-0"
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
              </div>
            ))}
          </div>
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
                      className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[hsl(var(--background))]"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStatusUpdate("passed")}
                      disabled={isPending}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-md hover:opacity-90 disabled:opacity-50"
                    >
                      Pass
                    </button>
                    <button
                      onClick={() => handleStatusUpdate("failed")}
                      disabled={isPending}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-500 rounded-md hover:opacity-90 disabled:opacity-50"
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

      {/* Add Scenarios Modal */}
      {showAddScenarios && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[hsl(var(--background))] rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
              <h2 className="text-lg font-semibold">Add Scenarios</h2>
              <button
                onClick={() => {
                  setShowAddScenarios(false);
                  setSelectedToAdd(new Set());
                  setScenarioSearch("");
                }}
                className="p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-[hsl(var(--border))]">
              <Input
                type="text"
                value={scenarioSearch}
                onChange={(e) => setScenarioSearch(e.target.value)}
                placeholder="Search scenarios..."
                className="w-full"
              />
            </div>

            <div className="flex-1 overflow-auto">
              {filteredAvailable.length === 0 ? (
                <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  {scenarioSearch ? "No matching scenarios found" : "All scenarios are already in this run"}
                </div>
              ) : (
                <div className="divide-y divide-[hsl(var(--border))]">
                  {filteredAvailable.map((scenario) => (
                    <label
                      key={scenario.id}
                      className={cn(
                        "flex items-start gap-3 p-3 cursor-pointer hover:bg-[hsl(var(--muted))]",
                        selectedToAdd.has(scenario.id) && "bg-brand-50 dark:bg-brand-900/20"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedToAdd.has(scenario.id)}
                        onChange={() => toggleAddSelection(scenario.id)}
                        className="mt-1 rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{scenario.title}</div>
                        <div className="text-sm text-[hsl(var(--muted-foreground))]">
                          {scenario.testCaseTitle}
                          {scenario.folderName && ` • ${scenario.folderName}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[hsl(var(--border))] flex items-center justify-between">
              <span className="text-sm text-[hsl(var(--muted-foreground))]">
                {selectedToAdd.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowAddScenarios(false);
                    setSelectedToAdd(new Set());
                    setScenarioSearch("");
                  }}
                  className="px-4 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddScenarios}
                  disabled={isPending || selectedToAdd.size === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-brand-500 rounded-md hover:bg-brand-600 disabled:opacity-50"
                >
                  Add {selectedToAdd.size > 0 && `(${selectedToAdd.size})`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "passed") {
    return (
      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center">
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

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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
