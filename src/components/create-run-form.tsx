"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createTestRun } from "@/app/runs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface Folder {
  id: number;
  name: string;
  parentId: number | null;
  order: number;
  caseCount: number;
  children: Folder[];
}

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

interface Props {
  folders: Folder[];
  cases: TestCase[];
  caseCounts: Record<number, number>;
}

export function CreateRunForm({ folders, cases, caseCounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedScenarios, setSelectedScenarios] = useState<Set<number>>(new Set());
  const [selectedCases, setSelectedCases] = useState<Set<number>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Total scenario count for display
  const totalScenarios = cases.reduce((sum, c) => sum + c.scenarios.length, 0);

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

  // Fetch Linear projects on mount
  useEffect(() => {
    async function fetchProjects() {
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
  }, []);

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

  const toggleFolder = (folderId: number) => {
    const newSelectedFolders = new Set(selectedFolders);
    const newSelectedCases = new Set(selectedCases);
    const newSelectedScenarios = new Set(selectedScenarios);
    const folderCases = cases.filter((c) => c.folderId === folderId);

    if (selectedFolders.has(folderId)) {
      newSelectedFolders.delete(folderId);
      folderCases.forEach((c) => {
        newSelectedCases.delete(c.id);
        c.scenarios.forEach((s) => newSelectedScenarios.delete(s.id));
      });
    } else {
      newSelectedFolders.add(folderId);
      folderCases.forEach((c) => {
        newSelectedCases.add(c.id);
        c.scenarios.forEach((s) => newSelectedScenarios.add(s.id));
      });
    }

    setSelectedFolders(newSelectedFolders);
    setSelectedCases(newSelectedCases);
    setSelectedScenarios(newSelectedScenarios);
  };

  const toggleCase = (caseId: number) => {
    const newSelectedCases = new Set(selectedCases);
    const newSelectedScenarios = new Set(selectedScenarios);
    const testCase = cases.find((c) => c.id === caseId);

    if (newSelectedCases.has(caseId)) {
      newSelectedCases.delete(caseId);
      testCase?.scenarios.forEach((s) => newSelectedScenarios.delete(s.id));
    } else {
      newSelectedCases.add(caseId);
      testCase?.scenarios.forEach((s) => newSelectedScenarios.add(s.id));
    }

    setSelectedCases(newSelectedCases);
    setSelectedScenarios(newSelectedScenarios);
  };

  const toggleScenario = (scenarioId: number, testCaseId: number) => {
    const newSelectedScenarios = new Set(selectedScenarios);
    const newSelectedCases = new Set(selectedCases);

    if (newSelectedScenarios.has(scenarioId)) {
      newSelectedScenarios.delete(scenarioId);
    } else {
      newSelectedScenarios.add(scenarioId);
    }

    // Update case selection based on scenario selection
    const testCase = cases.find((c) => c.id === testCaseId);
    if (testCase) {
      const allScenariosSelected = testCase.scenarios.every((s) =>
        newSelectedScenarios.has(s.id)
      );
      const anyScenariosSelected = testCase.scenarios.some((s) =>
        newSelectedScenarios.has(s.id)
      );

      if (allScenariosSelected) {
        newSelectedCases.add(testCaseId);
      } else if (!anyScenariosSelected) {
        newSelectedCases.delete(testCaseId);
      }
    }

    setSelectedScenarios(newSelectedScenarios);
    setSelectedCases(newSelectedCases);
  };

  const selectAll = () => {
    setSelectedCases(new Set(cases.map((c) => c.id)));
    setSelectedFolders(new Set(folders.map((f) => f.id)));
    setSelectedScenarios(new Set(cases.flatMap((c) => c.scenarios.map((s) => s.id))));
  };

  const clearAll = () => {
    setSelectedCases(new Set());
    setSelectedFolders(new Set());
    setSelectedScenarios(new Set());
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Run name is required");
      return;
    }
    if (selectedScenarios.size === 0) {
      setError("Select at least one scenario");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await createTestRun({
          name: name.trim(),
          description: description.trim() || null,
          scenarioIds: Array.from(selectedScenarios),
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
        <Button onClick={handleCreate} disabled={isPending}>
          {isPending ? (
            <>
              <LoadingIcon className="w-4 h-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Run"
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
        <div className="max-w-4xl space-y-6">
          {/* Run Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Run Name
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Release 2.0 Regression"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Full regression for v2.0 release"
              />
            </div>
          </div>

          {/* Linear Integration */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <LinearIcon className="w-4 h-4 text-brand-600" />
                <span className="text-sm font-medium text-foreground">Linear Integration</span>
                <span className="text-xs text-muted-foreground">(optional)</span>
              </div>

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
            </CardContent>
          </Card>

          {/* Test Case Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Select Scenarios
                </label>
                <p className="text-sm text-muted-foreground">
                  {selectedScenarios.size} scenario{selectedScenarios.size !== 1 ? "s" : ""} selected
                  {totalScenarios > 0 && ` of ${totalScenarios}`}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={selectAll}
                  className="text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium"
                >
                  Select all
                </button>
                <span className="text-border">|</span>
                <button
                  onClick={clearAll}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            </div>

            <Card>
              <CardContent className="p-0 max-h-96 overflow-auto">
                {folders.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                      <FolderIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground mb-1">No test cases available</p>
                    <p className="text-sm text-muted-foreground">
                      <Link href="/import" className="text-brand-500 hover:underline">
                        Import test cases
                      </Link>{" "}
                      first to create a run.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {folders.map((folder) => (
                      <FolderSection
                        key={folder.id}
                        folder={folder}
                        cases={cases.filter((c) => c.folderId === folder.id)}
                        selectedCases={selectedCases}
                        selectedFolders={selectedFolders}
                        selectedScenarios={selectedScenarios}
                        toggleFolder={toggleFolder}
                        toggleCase={toggleCase}
                        toggleScenario={toggleScenario}
                        caseCounts={caseCounts}
                      />
                    ))}
                    {/* Cases without folder */}
                    {cases.filter((c) => !c.folderId).length > 0 && (
                      <div className="p-4">
                        <div className="text-sm font-medium text-muted-foreground mb-3">
                          Uncategorized
                        </div>
                        <div className="space-y-2">
                          {cases
                            .filter((c) => !c.folderId)
                            .map((testCase) => (
                              <TestCaseItem
                                key={testCase.id}
                                testCase={testCase}
                                selectedCases={selectedCases}
                                selectedScenarios={selectedScenarios}
                                toggleCase={toggleCase}
                                toggleScenario={toggleScenario}
                              />
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}

function FolderSection({
  folder,
  cases,
  selectedCases,
  selectedFolders,
  selectedScenarios,
  toggleFolder,
  toggleCase,
  toggleScenario,
  caseCounts,
}: {
  folder: Folder;
  cases: TestCase[];
  selectedCases: Set<number>;
  selectedFolders: Set<number>;
  selectedScenarios: Set<number>;
  toggleFolder: (id: number) => void;
  toggleCase: (id: number) => void;
  toggleScenario: (scenarioId: number, testCaseId: number) => void;
  caseCounts: Record<number, number>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const count = caseCounts[folder.id] || 0;
  const isSelected = selectedFolders.has(folder.id);
  const totalScenarios = cases.reduce((sum, c) => sum + c.scenarios.length, 0);
  const selectedScenarioCount = cases.reduce(
    (sum, c) => sum + c.scenarios.filter((s) => selectedScenarios.has(s.id)).length,
    0
  );

  if (count === 0) return null;

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 hover:bg-muted rounded transition-colors"
        >
          <ChevronIcon
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-90"
            )}
          />
        </button>
        <label className="flex items-center gap-3 cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleFolder(folder.id)}
            className="rounded border-input text-brand-600 focus:ring-brand-500"
          />
          <FolderIcon className="w-4 h-4 text-amber-500" />
          <span className="font-medium text-foreground">{folder.name}</span>
          <span className="text-sm text-muted-foreground">
            {selectedScenarioCount > 0 && selectedScenarioCount < totalScenarios
              ? `${selectedScenarioCount}/${totalScenarios} scenarios`
              : `(${totalScenarios} scenarios)`}
          </span>
        </label>
      </div>

      {isOpen && (
        <div className="ml-10 mt-3 space-y-2 animate-fade-in">
          {cases.map((testCase) => (
            <TestCaseItem
              key={testCase.id}
              testCase={testCase}
              selectedCases={selectedCases}
              selectedScenarios={selectedScenarios}
              toggleCase={toggleCase}
              toggleScenario={toggleScenario}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TestCaseItem({
  testCase,
  selectedCases,
  selectedScenarios,
  toggleCase,
  toggleScenario,
}: {
  testCase: TestCase;
  selectedCases: Set<number>;
  selectedScenarios: Set<number>;
  toggleCase: (id: number) => void;
  toggleScenario: (scenarioId: number, testCaseId: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedCount = testCase.scenarios.filter((s) =>
    selectedScenarios.has(s.id)
  ).length;
  const hasScenarios = testCase.scenarios.length > 0;
  const allSelected = selectedCount === testCase.scenarios.length && hasScenarios;
  const someSelected = selectedCount > 0 && selectedCount < testCase.scenarios.length;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-3 p-2">
        {hasScenarios && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-muted rounded transition-colors"
          >
            <ChevronIcon
              className={cn(
                "w-3 h-3 text-muted-foreground transition-transform duration-200",
                isExpanded && "rotate-90"
              )}
            />
          </button>
        )}
        <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={() => toggleCase(testCase.id)}
            className="rounded border-input text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm truncate text-muted-foreground group-hover:text-foreground transition-colors">
            {testCase.title}
          </span>
          {hasScenarios && (
            <span className="text-xs text-muted-foreground shrink-0">
              ({selectedCount}/{testCase.scenarios.length})
            </span>
          )}
        </label>
      </div>

      {isExpanded && hasScenarios && (
        <div className="border-t border-border bg-muted/30 p-2 pl-10 space-y-1">
          {testCase.scenarios.map((scenario) => (
            <label
              key={scenario.id}
              className="flex items-center gap-3 py-1 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={selectedScenarios.has(scenario.id)}
                onChange={() => toggleScenario(scenario.id, testCase.id)}
                className="rounded border-input text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm truncate text-muted-foreground group-hover:text-foreground transition-colors">
                {scenario.title}
              </span>
            </label>
          ))}
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

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
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
      <path d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5765C17.7437 93.8542 4.10651 79.4589 1.22541 61.5228ZM.00189135 46.8891c-.01764375.2833.00333.5765.06289.8686.135.6547.39457 1.2773.76287 1.8359.30428.4629.66873.8855 1.05571 1.2634L52.3503 99.1795c.3879.3784.8213.7343 1.2928 1.0345 1.0157.6628 2.2042.9876 3.3784.8914C71.4499 100.167 83.9267 94.0717 93.2182 84.775c9.2874-9.2923 15.3823-21.7691 16.3172-36.2074.1022-1.5776-.3576-3.1011-1.2642-4.3177-2.7682-3.7138-5.9254-7.0862-9.4048-10.0739C83.2167 20.3171 63.1916 11.5273 41.1236 12.4818 18.9216 13.4426 2.47935 29.0281.00189135 46.8891Z" />
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
