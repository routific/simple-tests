"use client";

import { useState, useTransition, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createTestRun } from "@/app/runs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buildFolderBreadcrumb, formatBreadcrumb } from "@/lib/folders";
import { ReleasePicker } from "@/components/release-picker";

interface Scenario {
  id: number;
  title: string;
  testCaseId: number;
}

interface TestCase {
  id: number;
  title: string;
  folderId: number | null;
  folderName: string | null;
  state: string;
  scenarios: Scenario[];
}

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

interface Folder {
  id: number;
  name: string;
  parentId: number | null;
  order: number;
  caseCount: number;
  children: Folder[];
}

interface Release {
  id: number;
  name: string;
  status: "active" | "completed";
}

interface Props {
  folders: Folder[];
  cases: TestCase[];
  caseCounts: Record<number, number>;
  releases: Release[];
  initialSelectedCaseIds?: number[];
}

function getStateBadgeVariant(state: string) {
  switch (state) {
    case "active":
      return "success";
    case "draft":
      return "warning";
    case "retired":
      return "secondary";
    case "rejected":
      return "destructive";
    default:
      return "secondary";
  }
}

export function CreateRunForm({ folders, cases, caseCounts, releases: initialReleases, initialSelectedCaseIds = [] }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [selectedReleaseId, setSelectedReleaseId] = useState<number | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState<"sandbox" | "dev" | "staging" | "prod" | null>(null);
  const [releases, setReleases] = useState<Release[]>(initialReleases);
  const [selectedCases, setSelectedCases] = useState<Set<number>>(
    () => new Set(initialSelectedCaseIds)
  );
  const lastSelectedIndexRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("");

  // Flatten folder tree for breadcrumb lookups
  const flatFolders = useMemo(() => {
    const result: { id: number; name: string; parentId: number | null }[] = [];
    function flatten(nodes: Folder[]) {
      for (const node of nodes) {
        result.push({ id: node.id, name: node.name, parentId: node.parentId });
        if (node.children) flatten(node.children);
      }
    }
    flatten(folders);
    return result;
  }, [folders]);

  // Filter cases based on search and state
  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      // State filter - empty string means "all states"
      if (stateFilter && c.state !== stateFilter) return false;
      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = c.title.toLowerCase().includes(query);
        const matchesFolder = c.folderName?.toLowerCase().includes(query) ?? false;
        if (!matchesTitle && !matchesFolder) return false;
      }
      return true;
    });
  }, [cases, searchQuery, stateFilter]);

  // Count scenarios for selected cases
  const selectedScenarioCount = useMemo(() => {
    return cases
      .filter((c) => selectedCases.has(c.id))
      .reduce((sum, c) => sum + c.scenarios.length, 0);
  }, [cases, selectedCases]);

  // Linear integration state
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [milestones, setMilestones] = useState<LinearMilestone[]>([]);
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [selectedProject, setSelectedProject] = useState<LinearProject | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<LinearMilestone | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);
  const [issueSearch, setIssueSearch] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingMilestones, setLoadingMilestones] = useState(false);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [linearError, setLinearError] = useState<string | null>(null);

  // Fetch Linear projects
  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    setLinearError(null);
    try {
      const res = await fetch("/api/linear/projects");
      if (res.status === 401) {
        setLinearError("Linear connection expired. Please reconnect in Settings.");
        setProjects([]);
        return;
      }
      if (!res.ok) {
        setLinearError("Failed to load Linear projects");
        return;
      }
      const data = await res.json();
      setProjects(data);
    } catch (e) {
      console.error("Failed to fetch projects:", e);
      setLinearError("Failed to connect to Linear");
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  // Fetch Linear projects on mount
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Fetch milestones when project changes
  useEffect(() => {
    async function fetchMilestones() {
      if (!selectedProject) {
        setMilestones([]);
        return;
      }

      setLoadingMilestones(true);
      try {
        const res = await fetch(`/api/linear/milestones?projectId=${selectedProject.id}`);
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
  }, [selectedProject]);

  // Debounced issue search
  const searchIssues = useCallback(async (search: string) => {
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
    const timer = setTimeout(() => {
      searchIssues(issueSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [issueSearch, searchIssues]);

  const toggleCase = useCallback((id: number, shiftKey: boolean = false) => {
    const currentIndex = filteredCases.findIndex((c) => c.id === id);
    if (currentIndex === -1) return;

    // Shift+click: select range from last selected to current
    if (shiftKey && lastSelectedIndexRef.current !== null && lastSelectedIndexRef.current !== currentIndex) {
      const start = Math.min(lastSelectedIndexRef.current, currentIndex);
      const end = Math.max(lastSelectedIndexRef.current, currentIndex);
      setSelectedCases((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          if (filteredCases[i]) {
            next.add(filteredCases[i].id);
          }
        }
        return next;
      });
    } else {
      // Regular click: toggle single item
      setSelectedCases((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      lastSelectedIndexRef.current = currentIndex;
    }
  }, [filteredCases]);

  const selectAll = () => {
    const newSelected = new Set(selectedCases);
    filteredCases.forEach((c) => newSelected.add(c.id));
    setSelectedCases(newSelected);
  };

  const clearAll = () => {
    const newSelected = new Set(selectedCases);
    filteredCases.forEach((c) => newSelected.delete(c.id));
    setSelectedCases(newSelected);
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Run name is required");
      return;
    }
    if (selectedCases.size === 0) {
      setError("Select at least one test case");
      return;
    }

    // Gather all scenario IDs from selected test cases
    const scenarioIds = cases
      .filter((c) => selectedCases.has(c.id))
      .flatMap((c) => c.scenarios.map((s) => s.id));

    if (scenarioIds.length === 0) {
      setError("Selected test cases have no scenarios");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const selectedRelease = releases.find(r => r.id === selectedReleaseId);
        const result = await createTestRun({
          name: name.trim(),
          releaseId: selectedReleaseId,
          releaseName: selectedRelease?.name || null,
          scenarioIds,
          environment: selectedEnvironment,
          linearProjectId: selectedProject?.id || null,
          linearProjectName: selectedProject?.name || null,
          linearMilestoneId: selectedMilestone?.id || null,
          linearMilestoneName: selectedMilestone?.name || null,
          linearIssueId: selectedIssue?.id || null,
          linearIssueIdentifier: selectedIssue?.identifier || null,
          linearIssueTitle: selectedIssue?.title || null,
        });

        if (result.error) {
          setError(result.error);
        } else if (result.id) {
          router.push(`/runs/${result.id}`);
        }
      } catch {
        setError("Failed to create test run");
      }
    });
  };

  const allSelected = filteredCases.length > 0 && filteredCases.every((c) => selectedCases.has(c.id));
  const someSelected = filteredCases.some((c) => selectedCases.has(c.id)) && !allSelected;

  return (
    <>
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between bg-background">
        <div className="flex items-center gap-4">
          <Link
            href="/runs"
            className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          >
            <BackIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Create Test Run</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select test cases to include in this run
            </p>
          </div>
        </div>
        <Button onClick={handleCreate} disabled={isPending || selectedCases.size === 0}>
          {isPending ? (
            <>
              <LoadingIcon className="w-4 h-4 animate-spin" />
              Creating...
            </>
          ) : (
            `Create Run (${selectedCases.size} cases, ${selectedScenarioCount} scenarios)`
          )}
        </Button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm flex items-center gap-3">
          <ErrorIcon className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-6">
          {/* Run Details - Narrower width */}
          <div className="max-w-2xl">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Run Name
                </label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Login Tests"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Release <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <ReleasePicker
                  releases={releases}
                  value={selectedReleaseId}
                  onChange={setSelectedReleaseId}
                  onReleaseCreated={(newRelease) => {
                    setReleases((prev) => [...prev, newRelease]);
                  }}
                  placeholder="No release"
                />
              </div>
            </div>

            {/* Environment Selector */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-foreground mb-2">
                Environment <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <div className="flex gap-2">
                {(["sandbox", "dev", "staging", "prod"] as const).map((env) => (
                  <button
                    key={env}
                    type="button"
                    onClick={() => setSelectedEnvironment(selectedEnvironment === env ? null : env)}
                    className={cn(
                      "px-3 py-1.5 text-sm font-medium rounded-full border transition-colors",
                      selectedEnvironment === env
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

            {/* Linear Integration */}
            <Card className="mt-4">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <LinearIcon className="w-4 h-4 text-brand-600" />
                    <span className="text-sm font-medium text-foreground">Linear Integration</span>
                    <span className="text-xs text-muted-foreground">(optional)</span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchProjects}
                    disabled={loadingProjects}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors disabled:opacity-50"
                    title="Refresh Linear data"
                  >
                    <RefreshIcon className={cn("w-4 h-4", loadingProjects && "animate-spin")} />
                  </button>
                </div>

                {linearError ? (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <WarningIcon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{linearError}</span>
                    <Link href="/settings" className="text-amber-600 dark:text-amber-400 hover:underline font-medium">
                      Settings
                    </Link>
                  </div>
                ) : (
                <div className="grid grid-cols-3 gap-4">
                {/* Project Selector */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    Project
                  </label>
                  <select
                    value={selectedProject?.id || ""}
                    onChange={(e) => {
                      const project = projects.find((p) => p.id === e.target.value);
                      setSelectedProject(project || null);
                      setSelectedMilestone(null);
                    }}
                    disabled={loadingProjects}
                    className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors disabled:opacity-50"
                  >
                    <option value="">None</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Milestone Selector */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    Milestone
                  </label>
                  <select
                    value={selectedMilestone?.id || ""}
                    onChange={(e) => {
                      const milestone = milestones.find((m) => m.id === e.target.value);
                      setSelectedMilestone(milestone || null);
                    }}
                    disabled={!selectedProject || loadingMilestones}
                    className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors disabled:opacity-50"
                  >
                    <option value="">None</option>
                    {milestones.map((milestone) => (
                      <option key={milestone.id} value={milestone.id}>
                        {milestone.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Issue Selector with Search */}
                <div>
                  <label className="block text-sm text-muted-foreground mb-2">
                    Link to Issue
                  </label>
                  <div className="relative">
                    <Input
                      type="text"
                      value={selectedIssue ? `${selectedIssue.identifier}: ${selectedIssue.title}` : issueSearch}
                      onChange={(e) => {
                        if (selectedIssue) {
                          setSelectedIssue(null);
                        }
                        setIssueSearch(e.target.value);
                      }}
                      placeholder="Search issues..."
                      className="pr-8"
                    />
                    {selectedIssue && (
                      <button
                        onClick={() => setSelectedIssue(null)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <CloseIcon className="w-4 h-4" />
                      </button>
                    )}
                    {loadingIssues && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <LoadingIcon className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  {/* Issue dropdown */}
                  {!selectedIssue && issueSearch && issues.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
                      {issues.map((issue) => (
                        <button
                          key={issue.id}
                          onClick={() => {
                            setSelectedIssue(issue);
                            setIssueSearch("");
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-muted transition-colors flex items-center gap-2"
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: issue.state.color }}
                          />
                          <span className="font-medium text-sm">{issue.identifier}</span>
                          <span className="text-sm text-muted-foreground truncate">
                            {issue.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
                )}
            </CardContent>
          </Card>
          </div>

          {/* Test Case Selection - Full width */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Select Test Cases
                </label>
                <p className="text-sm text-muted-foreground">
                  {selectedCases.size} test case{selectedCases.size !== 1 ? "s" : ""} selected
                  ({selectedScenarioCount} scenario{selectedScenarioCount !== 1 ? "s" : ""})
                </p>
              </div>
            </div>

            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex h-[60vh]">
                  {/* Left: Selection List */}
                  <div className="flex-1 min-w-0 border-r border-border flex flex-col">
                    {/* Search and Filter Bar */}
                    <div className="p-4 border-b border-border flex gap-3 bg-muted/20">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected;
                          }}
                          onChange={() => {
                            if (allSelected || someSelected) {
                              clearAll();
                            } else {
                              selectAll();
                            }
                          }}
                          className="rounded border-input text-brand-600 focus:ring-brand-500 dark:border-muted-foreground/30 dark:bg-muted/50"
                          title={allSelected ? "Deselect all" : "Select all"}
                        />
                      </div>
                      <div className="flex-1 relative">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="text"
                          placeholder="Search test cases..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                      <select
                        value={stateFilter}
                        onChange={(e) => setStateFilter(e.target.value)}
                        className="pl-3 pr-8 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat"
                      >
                        <option value="">All states</option>
                        <option value="active">Active</option>
                        <option value="draft">Draft</option>
                        <option value="retired">Retired</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>

                    {/* Results */}
                    <div className="flex-1 overflow-auto">
                      {filteredCases.length === 0 ? (
                        <div className="p-12 text-center">
                          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                            <SearchIcon className="w-6 h-6 text-muted-foreground" />
                          </div>
                          <p className="font-medium text-foreground mb-1">No test cases found</p>
                          <p className="text-sm text-muted-foreground">
                            {cases.length === 0
                              ? "Create test cases first to include them in a run."
                              : "Try adjusting your search or filter."}
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {filteredCases.map((testCase) => (
                            <div
                              key={testCase.id}
                              onClick={(e) => toggleCase(testCase.id, e.shiftKey)}
                              className={cn(
                                "w-full flex items-center justify-between py-2.5 px-4 hover:bg-muted/50 transition-colors cursor-pointer group",
                                selectedCases.has(testCase.id) && "bg-brand-50 dark:bg-brand-950/50"
                              )}
                            >
                              <div className="flex items-center gap-1 min-w-0 flex-1">
                                <div
                                  className="p-2 -m-2 cursor-pointer flex-shrink-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCase(testCase.id, e.shiftKey);
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedCases.has(testCase.id)}
                                    readOnly
                                    className="rounded border-input text-brand-600 focus:ring-brand-500 dark:border-muted-foreground/30 dark:bg-muted/50 pointer-events-none"
                                  />
                                </div>
                                <span className="font-medium text-foreground truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                                  {testCase.title}
                                </span>
                              </div>
                              <div className="grid grid-cols-[160px_70px_40px] gap-2 items-center ml-4 flex-shrink-0">
                                <div className="flex justify-end">
                                  {testCase.folderId ? (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1.5 max-w-full truncate">
                                      <FolderIcon className="w-3 h-3 flex-shrink-0" />
                                      <span className="truncate">
                                        {formatBreadcrumb(buildFolderBreadcrumb(testCase.folderId, flatFolders))}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">No folder</span>
                                  )}
                                </div>
                                <div className="flex justify-end">
                                  <Badge variant={getStateBadgeVariant(testCase.state)}>
                                    {testCase.state}
                                  </Badge>
                                </div>
                                <span
                                  className="text-xs text-muted-foreground flex items-center gap-1 justify-end tabular-nums"
                                  title={`${testCase.scenarios.length} scenario${testCase.scenarios.length !== 1 ? 's' : ''}`}
                                >
                                  <ScenarioIcon className="w-3 h-3" />
                                  {testCase.scenarios.length}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Selection Preview */}
                  <SelectionPreview
                    cases={cases}
                    selectedCases={selectedCases}
                    onRemove={(id) => {
                      const newSelected = new Set(selectedCases);
                      newSelected.delete(id);
                      setSelectedCases(newSelected);
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function SelectionPreview({
  cases,
  selectedCases,
  onRemove,
}: {
  cases: TestCase[];
  selectedCases: Set<number>;
  onRemove: (id: number) => void;
}) {
  const [expandedCases, setExpandedCases] = useState<Set<number>>(new Set());

  const selectedTestCases = cases.filter((c) => selectedCases.has(c.id));

  const toggleExpanded = (id: number) => {
    setExpandedCases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="w-80 flex-shrink-0 bg-muted/30 flex flex-col">
      <div className="p-3 border-b border-border bg-muted/50">
        <span className="text-sm font-medium text-foreground">
          Selected ({selectedCases.size})
        </span>
      </div>
      {selectedCases.size === 0 ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div>
            <CheckCircleIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No test cases selected</p>
            <p className="text-xs text-muted-foreground mt-1">Select from the list on the left</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="divide-y divide-border">
            {selectedTestCases.map((testCase) => (
              <div key={testCase.id} className="bg-background">
                <div className="flex items-center gap-2 p-3 group">
                  {testCase.scenarios.length > 0 ? (
                    <button
                      onClick={() => toggleExpanded(testCase.id)}
                      className="p-0.5 hover:bg-muted rounded transition-colors"
                    >
                      <ChevronIcon
                        className={cn(
                          "w-4 h-4 text-muted-foreground transition-transform",
                          expandedCases.has(testCase.id) && "rotate-90"
                        )}
                      />
                    </button>
                  ) : (
                    <div className="w-5" />
                  )}
                  <span className="flex-1 text-sm font-medium text-foreground truncate">
                    {testCase.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {testCase.scenarios.length}
                  </span>
                  <button
                    onClick={() => onRemove(testCase.id)}
                    className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <CloseIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                {expandedCases.has(testCase.id) && testCase.scenarios.length > 0 && (
                  <div className="pb-2 px-3 pl-9 space-y-1">
                    {testCase.scenarios.map((scenario) => (
                      <div
                        key={scenario.id}
                        className="text-xs text-muted-foreground py-1 flex items-center gap-2"
                      >
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                        <span className="truncate">{scenario.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
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

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" />
    </svg>
  );
}

function ScenarioIcon({ className }: { className?: string }) {
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
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
      />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function CheckCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
