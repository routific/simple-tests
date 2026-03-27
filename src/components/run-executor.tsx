"use client";

import { useState, useTransition, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { cn, parseScreenshots, serializeScreenshots } from "@/lib/utils";
import { buildFolderBreadcrumb, formatBreadcrumb } from "@/lib/folders";
import { GherkinDisplay } from "./gherkin-editor";
import { ReleasePicker } from "./release-picker";
import { Input } from "./ui/input";
import { ResizablePanel } from "./ui/resizable-panel";
import { LinearProjectPicker, LinearMilestonePicker, LinearIssuePicker } from "./linear-pickers";
import { updateTestResult, completeTestRun, deleteTestRun, updateTestRun, addScenariosToRun, removeScenariosFromRun, getResultHistory, deleteAttempt, reorderRunScenarios, spawnBugIssue } from "@/app/runs/actions";
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
  executedBy: string | null;
  scenarioId: number;
  scenarioTitle: string;
  scenarioGherkin: string;
  testCaseId: number;
  testCaseTitle: string;
  folderId: number | null;
  screenshotUrl: string | null;
  // Snapshot fields - captured when test was completed
  scenarioTitleSnapshot: string | null;
  scenarioGherkinSnapshot: string | null;
  testCaseTitleSnapshot: string | null;
  // Bug ticket fields
  bugLinearIssueId: string | null;
  bugLinearIssueIdentifier: string | null;
}

interface Folder {
  id: number;
  name: string;
  parentId: number | null;
}

interface Collaborator {
  id: string;
  name: string;
  avatar: string | null;
}

interface Release {
  id: number;
  name: string;
  status: "active" | "completed";
  linearLabelId: string | null;
}

interface AvailableScenario {
  id: number;
  title: string;
  testCaseId: number;
  testCaseTitle: string;
  folderName: string | null;
}

interface HistoryEntry {
  id: number;
  status: string;
  notes: string | null;
  screenshotUrl: string | null;
  executedAt: Date | null;
  executedBy: string | null;
  archivedAt: Date;
  executorName: string | null;
  executorAvatar: string | null;
}

interface Props {
  run: TestRun;
  results: Result[];
  folders: Folder[];
  releases: Release[];
  availableScenarios: AvailableScenario[];
  linearWorkspace?: string;
  collaborators: Collaborator[];
  currentUser: Collaborator;
  initialScenarioId?: number | null;
}

export function RunExecutor({ run, results: initialResults, folders, releases: initialReleases, availableScenarios, linearWorkspace, collaborators: initialCollaborators, currentUser, initialScenarioId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [results, setResults] = useState<Result[]>(initialResults);
  const [collaborators, setCollaborators] = useState<Collaborator[]>(initialCollaborators);
  const [selectedResult, setSelectedResult] = useState<Result | null>(() => {
    // If deep-linking to a specific scenario, select it
    if (initialScenarioId) {
      const linkedResult = initialResults.find((r) => r.scenarioId === initialScenarioId);
      if (linkedResult) return linkedResult;
    }
    // Otherwise, select first pending or first result
    return initialResults.find((r) => r.status === "pending") || initialResults[0] || null;
  });
  const [notes, setNotes] = useState("");
  const [screenshotDataUrls, setScreenshotDataUrls] = useState<string[]>([]);
  const [screenshotLightbox, setScreenshotLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [resultHistory, setResultHistory] = useState<HistoryEntry[]>([]);

  // Sync results state when initialResults prop changes (after router.refresh)
  useEffect(() => {
    setResults(initialResults);
    // Update selected result to match new data if it still exists
    if (selectedResult) {
      const updatedResult = initialResults.find(r => r.id === selectedResult.id);
      if (updatedResult) {
        setSelectedResult(updatedResult);
      } else if (initialResults.length > 0) {
        // Selected result was removed, select first pending or first result
        setSelectedResult(initialResults.find(r => r.status === "pending") || initialResults[0]);
      } else {
        setSelectedResult(null);
      }
    } else if (initialResults.length > 0) {
      setSelectedResult(initialResults.find(r => r.status === "pending") || initialResults[0]);
    }
  }, [initialResults]);

  // Sync collaborators state when initialCollaborators prop changes
  useEffect(() => {
    setCollaborators(initialCollaborators);
  }, [initialCollaborators]);

  // Update URL with initially selected scenario on mount
  useEffect(() => {
    if (selectedResult && !initialScenarioId) {
      const url = new URL(window.location.href);
      url.searchParams.set("scenario", selectedResult.scenarioId.toString());
      window.history.replaceState({}, "", url.toString());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch history when selected result changes
  useEffect(() => {
    if (selectedResult && selectedResult.status !== "pending") {
      getResultHistory(selectedResult.id).then(setResultHistory);
    } else {
      setResultHistory([]);
    }
  }, [selectedResult?.id, selectedResult?.status]);

  // Show bug spawn modal after transition settles (avoids race with router.refresh)
  useEffect(() => {
    if (!isPending && pendingBugSpawnRef.current !== null) {
      const targetId = pendingBugSpawnRef.current;
      pendingBugSpawnRef.current = null;
      setBugSpawnTargetResultId(targetId);
      setBugSpawnError(null);
      setShowBugSpawnModal(true);
    }
  }, [isPending]);

  // Compress image to JPEG data URL
  const compressImage = useCallback((file: File, maxWidth = 1920, quality = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        URL.revokeObjectURL(img.src);
        if (dataUrl.length > 3 * 1024 * 1024) {
          reject(new Error("Image too large even after compression"));
          return;
        }
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }, []);

  // Handle paste events for screenshots
  useEffect(() => {
    if (run.status !== "in_progress" || !selectedResult) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          try {
            const dataUrl = await compressImage(file);
            setScreenshotDataUrls(prev => [...prev, dataUrl]);
          } catch {
            alert("Image too large. Please use a smaller screenshot.");
          }
          return;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [run.status, selectedResult, compressImage]);

  // Handle file input change
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file);
      setScreenshotDataUrls(prev => [...prev, dataUrl]);
    } catch {
      alert("Image too large. Please use a smaller screenshot.");
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  }, [compressImage]);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(run.name);
  const [editReleaseId, setEditReleaseId] = useState<number | null>(run.releaseId);
  const [editEnvironment, setEditEnvironment] = useState<"sandbox" | "dev" | "staging" | "prod" | null>(run.environment);
  const [releases, setReleases] = useState<Release[]>(initialReleases);
  const [showAddScenarios, setShowAddScenarios] = useState(false);
  const [scenarioSearch, setScenarioSearch] = useState("");
  const [runSearch, setRunSearch] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState<Set<number>>(new Set());
  const [selectedToRemove, setSelectedToRemove] = useState<Set<number>>(new Set());
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [draggedResultId, setDraggedResultId] = useState<number | null>(null);
  const [showBugSpawnModal, setShowBugSpawnModal] = useState(false);
  const [bugSpawnTargetResultId, setBugSpawnTargetResultId] = useState<number | null>(null);
  const [bugSpawnPending, setBugSpawnPending] = useState(false);
  const [bugSpawnError, setBugSpawnError] = useState<string | null>(null);
  const pendingBugSpawnRef = useRef<number | null>(null);

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

  // Get scenario IDs already in this run
  const existingScenarioIds = useMemo(() => new Set(results.map(r => r.scenarioId)), [results]);

  // Group ALL scenarios by test case, marking which are already in the run
  const groupedByTestCase = useMemo(() => {
    // First apply search filter
    const searchFiltered = availableScenarios.filter(s => {
      if (!scenarioSearch) return true;
      const search = scenarioSearch.toLowerCase();
      return s.title.toLowerCase().includes(search) ||
        s.testCaseTitle.toLowerCase().includes(search) ||
        (s.folderName?.toLowerCase().includes(search) ?? false);
    });

    const groups = new Map<number, {
      testCaseId: number;
      testCaseTitle: string;
      folderName: string | null;
      scenarios: Array<AvailableScenario & { inRun: boolean }>;
      inRunCount: number;
      availableCount: number;
    }>();

    for (const scenario of searchFiltered) {
      const inRun = existingScenarioIds.has(scenario.id);
      const existing = groups.get(scenario.testCaseId);
      if (existing) {
        existing.scenarios.push({ ...scenario, inRun });
        if (inRun) existing.inRunCount++;
        else existing.availableCount++;
      } else {
        groups.set(scenario.testCaseId, {
          testCaseId: scenario.testCaseId,
          testCaseTitle: scenario.testCaseTitle,
          folderName: scenario.folderName,
          scenarios: [{ ...scenario, inRun }],
          inRunCount: inRun ? 1 : 0,
          availableCount: inRun ? 0 : 1,
        });
      }
    }
    return Array.from(groups.values());
  }, [availableScenarios, existingScenarioIds, scenarioSearch]);

  // Count of scenarios available to add (not already in run)
  const totalAvailableToAdd = useMemo(() => {
    return groupedByTestCase.reduce((sum, group) => sum + group.availableCount, 0);
  }, [groupedByTestCase]);

  // Filter results for run search
  const filteredResults = useMemo(() => {
    if (!runSearch) return results;
    const search = runSearch.toLowerCase();
    return results.filter(r => {
      if (r.scenarioTitle.toLowerCase().includes(search)) return true;
      if (r.testCaseTitle.toLowerCase().includes(search)) return true;
      if (r.testCaseId.toString() === search) return true;
      if (r.scenarioId.toString() === search) return true;
      if (r.folderId) {
        const folder = folders.find(f => f.id === r.folderId);
        if (folder && folder.name.toLowerCase().includes(search)) return true;
      }
      return false;
    });
  }, [results, runSearch, folders]);

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
    fetchProjects();
  }, [isEditing, fetchProjects]);

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

  // Ref for notes textarea to enable focus shortcut
  const notesRef = useRef<HTMLTextAreaElement>(null);

  // Keyboard shortcuts for test execution
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger when typing in inputs (except for navigation keys)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" ||
                      target.tagName === "TEXTAREA" ||
                      target.tagName === "SELECT" ||
                      target.isContentEditable;

      // Navigation shortcuts work even in inputs
      if (e.key === "Escape") {
        if (showBugSpawnModal) {
          setShowBugSpawnModal(false);
          setBugSpawnTargetResultId(null);
          setBugSpawnError(null);
          e.preventDefault();
          return;
        }
        if (showCompleteConfirm) {
          setShowCompleteConfirm(false);
          e.preventDefault();
          return;
        }
        if (showAddScenarios) {
          setShowAddScenarios(false);
          setSelectedToAdd(new Set());
          setScenarioSearch("");
          e.preventDefault();
          return;
        }
        if (isEditing) {
          handleCancelEdit();
          e.preventDefault();
          return;
        }
        // Blur any focused input
        if (isInput) {
          (target as HTMLElement).blur();
          e.preventDefault();
          return;
        }
      }

      // Don't process other shortcuts when typing
      if (isInput) return;

      // Only enable execution shortcuts when run is in progress and not editing
      if (run.status !== "in_progress" || isEditing || showAddScenarios || showBugSpawnModal) return;

      switch (e.key.toLowerCase()) {
        case "p":
          e.preventDefault();
          if (selectedResult && !isPending) {
            handleStatusUpdate("passed");
          }
          break;

        case "f":
          e.preventDefault();
          if (selectedResult && !isPending) {
            handleStatusUpdate("failed");
          }
          break;

        case "b":
          e.preventDefault();
          if (selectedResult && !isPending) {
            handleStatusUpdate("blocked");
          }
          break;

        case "s":
          e.preventDefault();
          if (selectedResult && !isPending) {
            handleStatusUpdate("skipped");
          }
          break;

        case "j":
        case "arrowdown":
          e.preventDefault();
          if (selectedResult) {
            const currentIndex = results.findIndex(r => r.id === selectedResult.id);
            if (currentIndex < results.length - 1) {
              const next = results[currentIndex + 1];
              setSelectedResult(next);
              setNotes("");
              // Update URL with scenario parameter
              const url = new URL(window.location.href);
              url.searchParams.set("scenario", next.scenarioId.toString());
              window.history.replaceState({}, "", url.toString());
            }
          }
          break;

        case "k":
        case "arrowup":
          e.preventDefault();
          if (selectedResult) {
            const currentIndex = results.findIndex(r => r.id === selectedResult.id);
            if (currentIndex > 0) {
              const prev = results[currentIndex - 1];
              setSelectedResult(prev);
              setNotes("");
              // Update URL with scenario parameter
              const url = new URL(window.location.href);
              url.searchParams.set("scenario", prev.scenarioId.toString());
              window.history.replaceState({}, "", url.toString());
            }
          }
          break;

        case "n":
          e.preventDefault();
          notesRef.current?.focus();
          break;

        case "e":
          e.preventDefault();
          setIsEditing(true);
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [run.status, isEditing, showAddScenarios, showCompleteConfirm, showBugSpawnModal, selectedResult, results, isPending]);

  const handleStatusUpdate = (status: "passed" | "failed" | "blocked" | "skipped") => {
    if (!selectedResult) return;

    const executedAt = new Date();
    const currentNotes = notes.trim() || null;

    const currentScreenshots = [...screenshotDataUrls];

    // Optimistically update local state
    const updatedResult: Result = {
      ...selectedResult,
      status,
      notes: currentNotes,
      screenshotUrl: serializeScreenshots(currentScreenshots),
      executedAt,
      executedBy: currentUser.id,
      // Capture snapshots (same as server does)
      scenarioTitleSnapshot: selectedResult.scenarioTitleSnapshot || selectedResult.scenarioTitle,
      scenarioGherkinSnapshot: selectedResult.scenarioGherkinSnapshot || selectedResult.scenarioGherkin,
      testCaseTitleSnapshot: selectedResult.testCaseTitleSnapshot || selectedResult.testCaseTitle,
    };

    // Update results array
    setResults(prev => prev.map(r => r.id === selectedResult.id ? updatedResult : r));

    // Add current user to collaborators if not already present
    if (!collaborators.find(c => c.id === currentUser.id)) {
      setCollaborators(prev => [...prev, currentUser]);
    }

    // Move to next pending case
    const currentIndex = results.findIndex((r) => r.id === selectedResult.id);
    const nextPending = results.find((r, i) => i > currentIndex && r.status === "pending");
    if (nextPending) {
      setSelectedResult(nextPending);
      setNotes("");
      setScreenshotDataUrls([]);
    } else {
      // Stay on current result but update it
      setSelectedResult(updatedResult);
      setNotes("");
      setScreenshotDataUrls([]);

      // Check if all scenarios are now executed (including the one just updated)
      const wasLastPending = selectedResult.status === "pending" &&
        results.filter(r => r.status === "pending").length === 1;

      // Prompt to complete the run if this was the last pending scenario
      if (wasLastPending && run.status === "in_progress") {
        // Small delay to let the UI update first
        setTimeout(() => setShowCompleteConfirm(true), 300);
      }
    }

    // Flag intent to show bug spawn modal — actual show happens after transition settles
    if (status === "failed" && run.linearIssueId && !selectedResult.bugLinearIssueId) {
      pendingBugSpawnRef.current = selectedResult.id;
    }

    startTransition(async () => {
      await updateTestResult({
        resultId: selectedResult.id,
        status,
        notes: currentNotes || undefined,
        screenshotUrls: currentScreenshots,
      });

      router.refresh();
    });
  };

  const handleSpawnBug = async () => {
    if (!bugSpawnTargetResultId) return;
    setBugSpawnPending(true);
    setBugSpawnError(null);
    const result = await spawnBugIssue({
      resultId: bugSpawnTargetResultId,
      runId: run.id,
    });
    if (result.success && result.bugIssueIdentifier) {
      // Update local results state with bug issue info
      setResults(prev => prev.map(r =>
        r.id === bugSpawnTargetResultId
          ? { ...r, bugLinearIssueId: result.bugIssueId!, bugLinearIssueIdentifier: result.bugIssueIdentifier! }
          : r
      ));
      if (selectedResult?.id === bugSpawnTargetResultId) {
        setSelectedResult(prev => prev ? { ...prev, bugLinearIssueId: result.bugIssueId!, bugLinearIssueIdentifier: result.bugIssueIdentifier! } : null);
      }
      setShowBugSpawnModal(false);
      setBugSpawnTargetResultId(null);
      router.refresh();
    } else if (result.error) {
      setBugSpawnError(result.error);
    }
    setBugSpawnPending(false);
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
        environment: editEnvironment,
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
    setEditEnvironment(run.environment);
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

  const handleResultDragStart = (e: React.DragEvent, resultId: number) => {
    setDraggedResultId(resultId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleResultDragOver = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggedResultId === null || draggedResultId === targetId) return;

    const draggedIndex = results.findIndex(r => r.id === draggedResultId);
    const targetIndex = results.findIndex(r => r.id === targetId);
    if (draggedIndex === targetIndex) return;

    const newResults = [...results];
    const [removed] = newResults.splice(draggedIndex, 1);
    newResults.splice(targetIndex, 0, removed);
    setResults(newResults);
  };

  const handleResultDragEnd = () => {
    if (draggedResultId !== null && isEditing) {
      startTransition(async () => {
        const ids = results.map(r => r.id);
        await reorderRunScenarios(run.id, ids);
      });
    }
    setDraggedResultId(null);
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
                  className="w-64"
                />
                {/* Environment Selector */}
                <div className="flex items-center gap-1">
                  {(["sandbox", "dev", "staging", "prod"] as const).map((env) => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => setEditEnvironment(editEnvironment === env ? null : env)}
                      className={cn(
                        "px-2.5 py-1.5 text-xs font-medium rounded-full border transition-colors",
                        editEnvironment === env
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
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <LinearIcon className="w-4 h-4 text-brand-600" />
                    <span className="text-sm font-medium">Linear Integration</span>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">(optional)</span>
                  </div>
                  <button
                    type="button"
                    onClick={fetchProjects}
                    disabled={loadingProjects}
                    className="p-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] rounded transition-colors disabled:opacity-50"
                    title="Refresh Linear data"
                  >
                    <RefreshIcon className={cn("w-4 h-4", loadingProjects && "animate-spin")} />
                  </button>
                </div>

                {linearError ? (
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center flex-shrink-0">
                        <WarningIcon className="w-4 h-4 text-yellow-600 dark:text-yellow-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                          Linear connection expired
                        </p>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          Click &quot;Reconnect&quot; to re-authenticate with Linear.
                        </p>
                      </div>
                      <button
                        onClick={() => signIn("linear")}
                        className="px-3 py-1.5 text-sm font-medium text-yellow-800 dark:text-yellow-200 bg-yellow-100 dark:bg-yellow-800/50 hover:bg-yellow-200 dark:hover:bg-yellow-800 rounded-md transition-colors"
                      >
                        Reconnect
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="grid grid-cols-3 gap-4">
                  {/* Project Selector */}
                  <LinearProjectPicker
                    projects={projects}
                    value={editProject}
                    onChange={(project) => {
                      setEditProject(project);
                      setEditMilestone(null);
                    }}
                    loading={loadingProjects}
                  />

                  {/* Milestone Selector */}
                  <LinearMilestonePicker
                    milestones={milestones}
                    value={editMilestone}
                    onChange={setEditMilestone}
                    disabled={!editProject}
                    loading={loadingMilestones}
                  />

                  {/* Issue Selector */}
                  <LinearIssuePicker
                    issues={issues}
                    value={editIssue}
                    onChange={(issue) => {
                      setEditIssue(issue);
                      if (issue) setIssues([]);
                    }}
                    searchValue={issueSearch}
                    onSearchChange={setIssueSearch}
                    loading={loadingIssues}
                  />
                </div>
                )}
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
                {run.environment && (
                  <>
                    <span className="text-border">·</span>
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
                  {run.status === "in_progress" ? "In Progress" : "Completed"}
                </span>
                {/* Collaborator avatars */}
                {collaborators.length > 0 && (
                  <>
                    <span className="text-border">·</span>
                    <div className="flex items-center -space-x-2" title={collaborators.map(c => c.name).join(", ")}>
                      {collaborators.slice(0, 5).map((collaborator) => (
                        collaborator.avatar ? (
                          <img
                            key={collaborator.id}
                            src={collaborator.avatar}
                            alt={collaborator.name}
                            title={collaborator.name}
                            className="w-6 h-6 rounded-full ring-2 ring-background"
                          />
                        ) : (
                          <div
                            key={collaborator.id}
                            title={collaborator.name}
                            className="w-6 h-6 rounded-full bg-brand-500/10 flex items-center justify-center ring-2 ring-background"
                          >
                            <span className="text-[10px] font-medium text-brand-600">
                              {collaborator.name?.[0]?.toUpperCase() || "?"}
                            </span>
                          </div>
                        )
                      ))}
                      {collaborators.length > 5 && (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center ring-2 ring-background">
                          <span className="text-[10px] font-medium text-muted-foreground">
                            +{collaborators.length - 5}
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )}
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
              onClick={() => setShowCompleteConfirm(true)}
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
        <ResizablePanel
          defaultWidth={320}
          minWidth={240}
          maxWidth={600}
          storageKey="run-scenario-panel-width"
          className="border-r border-[hsl(var(--border))] overflow-auto flex flex-col h-full"
        >
          {/* Search bar for run scenarios */}
          <div className="p-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--muted-foreground))]" />
              <Input
                type="text"
                value={runSearch}
                onChange={(e) => setRunSearch(e.target.value)}
                placeholder="Search by name or ID..."
                className="w-full pl-8 h-8 text-sm"
              />
              {runSearch && (
                <button
                  onClick={() => setRunSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                >
                  <CloseIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* List header with actions */}
          <div className="p-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))]/50 flex items-center justify-between gap-2">
            {run.status === "in_progress" && selectedToRemove.size > 0 ? (
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
                <span className="text-sm font-medium">
                  {runSearch && filteredResults.length !== results.length 
                    ? `${filteredResults.length} of ${results.length}` 
                    : results.length} scenarios
                </span>
                {run.status === "in_progress" && (
                  <button
                    onClick={() => setShowAddScenarios(true)}
                    className="px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded flex items-center gap-1"
                  >
                    <PlusIcon className="w-3 h-3" />
                    Add
                  </button>
                )}
              </>
            )}
          </div>

          {/* Scenario list */}
          <div className="flex-1 overflow-auto">
            {filteredResults.length === 0 && runSearch ? (
              <div className="p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
                No scenarios match "{runSearch}"
              </div>
            ) : filteredResults.map((result) => (
              <div
                key={result.id}
                draggable={isEditing && run.status === "in_progress" && !runSearch}
                onDragStart={(e) => handleResultDragStart(e, result.id)}
                onDragOver={(e) => handleResultDragOver(e, result.id)}
                onDragEnd={handleResultDragEnd}
                className={cn(
                  "w-full text-left p-3 border-b border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] flex items-start gap-2",
                  selectedResult?.id === result.id && "bg-brand-50 dark:bg-brand-950/50 ring-2 ring-brand-500 ring-inset",
                  draggedResultId === result.id && "opacity-50"
                )}
              >
                {run.status === "in_progress" && isEditing && (
                  <>
                    <div className="cursor-grab active:cursor-grabbing mt-1 text-[hsl(var(--muted-foreground))]">
                      <DragHandleIcon className="w-4 h-4" />
                    </div>
                    <input
                      type="checkbox"
                      checked={selectedToRemove.has(result.id)}
                      onChange={() => toggleRemoveSelection(result.id)}
                      className="mt-1 rounded border-gray-300"
                    />
                  </>
                )}
                <button
                  onClick={() => {
                    setSelectedResult(result);
                    setNotes("");
                    // Update URL with scenario parameter
                    const url = new URL(window.location.href);
                    url.searchParams.set("scenario", result.scenarioId.toString());
                    window.history.replaceState({}, "", url.toString());
                  }}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <StatusIcon status={result.status} />
                    <span className="font-medium truncate flex-1">{result.scenarioTitle}</span>
                  </div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1 ml-6 truncate">
                    {result.folderId && (
                      <span className="opacity-70">
                        {formatBreadcrumb(buildFolderBreadcrumb(result.folderId, folders), " / ")}
                        {" / "}
                      </span>
                    )}
                    {result.testCaseTitle}
                  </div>
                </button>
              </div>
            ))}
          </div>
        </ResizablePanel>

        {/* Detail panel */}
        <div className="flex-1 overflow-auto p-4">
          {selectedResult ? (
            <div className="max-w-3xl">
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0 flex-1">
                  {/* Folder breadcrumb */}
                  {selectedResult.folderId && (
                    <div className="text-xs text-[hsl(var(--muted-foreground))] mb-1 flex items-center gap-1">
                      <FolderIcon className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">
                        {formatBreadcrumb(buildFolderBreadcrumb(selectedResult.folderId, folders), " / ")}
                      </span>
                    </div>
                  )}
                  {/* Test case title */}
                  <div className="text-sm text-[hsl(var(--muted-foreground))] mb-1">
                    {selectedResult.testCaseTitleSnapshot || selectedResult.testCaseTitle}
                  </div>
                  {/* Scenario title + status */}
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-medium">{selectedResult.scenarioTitleSnapshot || selectedResult.scenarioTitle}</h2>
                    {selectedResult.status !== "pending" && (
                      <span
                        className={cn(
                          "px-2.5 py-1 text-xs font-medium rounded-full flex-shrink-0",
                          selectedResult.status === "passed"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : selectedResult.status === "failed"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                            : selectedResult.status === "blocked"
                            ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                        )}
                      >
                        {selectedResult.status.charAt(0).toUpperCase() + selectedResult.status.slice(1)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/runs/${run.id}?scenario=${selectedResult.scenarioId}`;
                      navigator.clipboard.writeText(url);
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }}
                    className={cn(
                      "p-1.5 rounded transition-colors flex items-center gap-1",
                      linkCopied
                        ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20"
                        : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
                    )}
                    title="Copy link to this scenario"
                  >
                    {linkCopied ? (
                      <>
                        <CheckIcon className="w-4 h-4" />
                        <span className="text-xs">Copied</span>
                      </>
                    ) : (
                      <LinkIcon className="w-4 h-4" />
                    )}
                  </button>
                  <Link
                    href={`/cases/${selectedResult.testCaseId}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    View case
                  </Link>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-sm font-medium mb-2">Steps</h3>
                <GherkinDisplay text={selectedResult.scenarioGherkinSnapshot || selectedResult.scenarioGherkin} />
              </div>

              {/* Attempts log - current result + history */}
              {selectedResult.status !== "pending" && selectedResult.executedBy && (
                <div className="mb-6">
                  <div className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                    <HistoryIcon className="w-4 h-4" />
                    Attempts
                  </div>
                  <div className="space-y-2">
                    {/* Current result */}
                    <div className="p-2 bg-muted/30 rounded text-sm group/attempt">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "px-2 py-0.5 text-xs font-medium rounded-full",
                            selectedResult.status === "passed"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : selectedResult.status === "failed"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                              : selectedResult.status === "blocked"
                              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                          )}
                        >
                          {selectedResult.status.charAt(0).toUpperCase() + selectedResult.status.slice(1)}
                        </span>
                        {(() => {
                          const executor = collaborators.find(c => c.id === selectedResult.executedBy);
                          return executor ? (
                            <div className="flex items-center gap-1.5">
                              {executor.avatar ? (
                                <img src={executor.avatar} alt="" className="w-5 h-5 rounded-full" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-brand-500/10 flex items-center justify-center">
                                  <span className="text-[10px] font-medium text-brand-600">
                                    {executor.name?.[0]?.toUpperCase() || "?"}
                                  </span>
                                </div>
                              )}
                              <span className="text-foreground">{executor.name}</span>
                            </div>
                          ) : null;
                        })()}
                        {selectedResult.executedAt && (
                          <span className="text-muted-foreground">
                            {new Date(selectedResult.executedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                        {run.status === "in_progress" && selectedResult.executedBy === currentUser.id && (
                          <button
                            onClick={() => {
                              if (confirm("Delete this attempt? This will reset the test to pending.")) {
                                startTransition(async () => {
                                  const result = await deleteAttempt({
                                    type: "current",
                                    resultId: selectedResult.id,
                                  });
                                  if (result.success) {
                                    // Update local state
                                    setResults(prev => prev.map(r =>
                                      r.id === selectedResult.id
                                        ? { ...r, status: "pending", notes: null, screenshotUrl: null, executedAt: null, executedBy: null, bugLinearIssueId: null, bugLinearIssueIdentifier: null }
                                        : r
                                    ));
                                    setSelectedResult(prev => prev ? { ...prev, status: "pending", notes: null, screenshotUrl: null, executedAt: null, executedBy: null, bugLinearIssueId: null, bugLinearIssueIdentifier: null } : null);
                                    setResultHistory([]);
                                    router.refresh();
                                  }
                                });
                              }
                            }}
                            className="ml-auto opacity-0 group-hover/attempt:opacity-100 p-1 text-muted-foreground hover:text-rose-600 transition-opacity"
                            title="Delete this attempt"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {selectedResult.notes && (
                        <p className="mt-1 text-muted-foreground">{selectedResult.notes}</p>
                      )}
                      {parseScreenshots(selectedResult.screenshotUrl).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {parseScreenshots(selectedResult.screenshotUrl).map((url, i) => (
                            <button
                              key={i}
                              onClick={() => setScreenshotLightbox(url)}
                              className="block"
                            >
                              <img
                                src={url}
                                alt={`Screenshot ${i + 1}`}
                                className="max-h-32 rounded border border-[hsl(var(--border))] hover:opacity-80 transition-opacity cursor-zoom-in"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Bug ticket: link or spawn button */}
                      {selectedResult.bugLinearIssueIdentifier && linearWorkspace ? (
                        <a
                          href={`https://linear.app/${linearWorkspace}/issue/${selectedResult.bugLinearIssueIdentifier}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 px-2.5 py-1.5 rounded-md border border-rose-200 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-colors"
                        >
                          <BugIcon className="w-3.5 h-3.5" />
                          {selectedResult.bugLinearIssueIdentifier}
                          <ExternalLinkIcon className="w-3 h-3 opacity-60" />
                        </a>
                      ) : selectedResult.status === "failed" && run.linearIssueId && !selectedResult.bugLinearIssueId ? (
                        <button
                          onClick={() => {
                            setBugSpawnTargetResultId(selectedResult.id);
                            setBugSpawnError(null);
                            setShowBugSpawnModal(true);
                          }}
                          className="mt-2 px-2.5 py-1.5 rounded-md border border-rose-200 dark:border-rose-800/50 text-rose-600 dark:text-rose-400 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        >
                          <BugIcon className="w-3.5 h-3.5" />
                          Spawn bug issue
                        </button>
                      ) : null}
                    </div>
                    {/* Previous attempts */}
                    {resultHistory.map((entry) => (
                      <div key={entry.id} className="p-2 bg-muted/30 rounded text-sm group/attempt">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "px-2 py-0.5 text-xs font-medium rounded-full",
                              entry.status === "passed"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : entry.status === "failed"
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                                : entry.status === "blocked"
                                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                            )}
                          >
                            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                          </span>
                          {entry.executorName && (
                            <div className="flex items-center gap-1.5">
                              {entry.executorAvatar ? (
                                <img src={entry.executorAvatar} alt="" className="w-5 h-5 rounded-full" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-brand-500/10 flex items-center justify-center">
                                  <span className="text-[10px] font-medium text-brand-600">
                                    {entry.executorName?.[0]?.toUpperCase() || "?"}
                                  </span>
                                </div>
                              )}
                              <span className="text-foreground">{entry.executorName}</span>
                            </div>
                          )}
                          {entry.executedAt && (
                            <span className="text-muted-foreground">
                              {new Date(entry.executedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                          {run.status === "in_progress" && entry.executedBy === currentUser.id && (
                            <button
                              onClick={() => {
                                if (confirm("Delete this attempt?")) {
                                  startTransition(async () => {
                                    const result = await deleteAttempt({
                                      type: "history",
                                      resultId: selectedResult.id,
                                      historyId: entry.id,
                                    });
                                    if (result.success) {
                                      setResultHistory(prev => prev.filter(h => h.id !== entry.id));
                                      router.refresh();
                                    }
                                  });
                                }
                              }}
                              className="ml-auto opacity-0 group-hover/attempt:opacity-100 p-1 text-muted-foreground hover:text-rose-600 transition-opacity"
                              title="Delete this attempt"
                            >
                              <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {entry.notes && (
                          <p className="mt-1 text-muted-foreground">{entry.notes}</p>
                        )}
                        {parseScreenshots(entry.screenshotUrl).length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {parseScreenshots(entry.screenshotUrl).map((url, i) => (
                              <button
                                key={i}
                                onClick={() => setScreenshotLightbox(url)}
                                className="block"
                              >
                                <img
                                  src={url}
                                  alt={`Screenshot ${i + 1}`}
                                  className="max-h-24 rounded border border-[hsl(var(--border))] hover:opacity-80 transition-opacity cursor-zoom-in"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {run.status === "in_progress" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Notes (optional)</label>
                    <textarea
                      ref={notesRef}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any notes about this test..."
                      className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[hsl(var(--background))]"
                    />
                  </div>

                  {/* Screenshot attachment */}
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <div className="flex flex-wrap gap-2 items-end">
                      {screenshotDataUrls.map((url, i) => (
                        <div key={i} className="relative inline-block group">
                          <img
                            src={url}
                            alt={`Screenshot ${i + 1}`}
                            className="max-h-28 rounded border border-[hsl(var(--border))] cursor-zoom-in"
                            onClick={() => setScreenshotLightbox(url)}
                          />
                          <button
                            onClick={() => setScreenshotDataUrls(prev => prev.filter((_, j) => j !== i))}
                            className="absolute -top-2 -right-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-rose-600 shadow-sm"
                            title="Remove screenshot"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
                        </svg>
                        {screenshotDataUrls.length > 0 ? "Add another" : "Attach screenshot"}
                        {screenshotDataUrls.length === 0 && <span className="opacity-50">(or paste)</span>}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStatusUpdate("passed")}
                      disabled={isPending}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-emerald-500 rounded-md hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      Pass
                      <kbd className="text-[10px] px-1.5 py-0.5 bg-emerald-600/50 rounded opacity-70">P</kbd>
                    </button>
                    <button
                      onClick={() => handleStatusUpdate("failed")}
                      disabled={isPending}
                      className="flex-1 px-4 py-2 text-sm font-medium text-white bg-rose-500 rounded-md hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      Fail
                      <kbd className="text-[10px] px-1.5 py-0.5 bg-rose-600/50 rounded opacity-70">F</kbd>
                    </button>
                    <button
                      onClick={() => handleStatusUpdate("blocked")}
                      disabled={isPending}
                      className="px-4 py-2 text-sm font-medium text-orange-600 border border-orange-600 rounded-md hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      Blocked
                      <kbd className="text-[10px] px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/50 rounded opacity-70">B</kbd>
                    </button>
                    <button
                      onClick={() => handleStatusUpdate("skipped")}
                      disabled={isPending}
                      className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
                    >
                      Skip
                      <kbd className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded opacity-70">S</kbd>
                    </button>
                  </div>
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
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowAddScenarios(false);
              setSelectedToAdd(new Set());
              setScenarioSearch("");
            }}
          />
          {/* Modal */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              className="relative bg-background rounded-xl shadow-xl border border-border w-full max-w-2xl max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold">Add Scenarios</h2>
                <p className="text-sm text-muted-foreground mt-1">Select scenarios to add to this test run</p>
              </div>
              <button
                onClick={() => {
                  setShowAddScenarios(false);
                  setSelectedToAdd(new Set());
                  setScenarioSearch("");
                }}
                className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>

            <div className="px-6 py-4 border-b border-border">
              <Input
                type="text"
                value={scenarioSearch}
                onChange={(e) => setScenarioSearch(e.target.value)}
                placeholder="Search test cases or scenarios..."
                className="w-full"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-auto">
              {groupedByTestCase.length === 0 ? (
                <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  {scenarioSearch ? "No matching scenarios found" : "No scenarios available"}
                </div>
              ) : totalAvailableToAdd === 0 && !scenarioSearch ? (
                <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
                  All scenarios are already in this run
                </div>
              ) : (
                <div className="divide-y divide-[hsl(var(--border))]">
                  {groupedByTestCase.map((group) => {
                    const availableScenarios = group.scenarios.filter(s => !s.inRun);
                    const allAvailableSelected = availableScenarios.length > 0 && availableScenarios.every(s => selectedToAdd.has(s.id));
                    const someAvailableSelected = availableScenarios.some(s => selectedToAdd.has(s.id));
                    const hasAvailableScenarios = availableScenarios.length > 0;
                    const toggleAll = () => {
                      if (!hasAvailableScenarios) return;
                      setSelectedToAdd(prev => {
                        const next = new Set(prev);
                        if (allAvailableSelected) {
                          availableScenarios.forEach(s => next.delete(s.id));
                        } else {
                          availableScenarios.forEach(s => next.add(s.id));
                        }
                        return next;
                      });
                    };
                    return (
                      <div key={group.testCaseId}>
                        {/* Test case header */}
                        <div
                          className={cn(
                            "flex items-center gap-3 p-3 bg-muted/30",
                            hasAvailableScenarios && "cursor-pointer hover:bg-[hsl(var(--muted))]",
                            allAvailableSelected && "bg-brand-50 dark:bg-brand-900/20"
                          )}
                          onClick={hasAvailableScenarios ? toggleAll : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={allAvailableSelected}
                            disabled={!hasAvailableScenarios}
                            ref={(el) => { if (el) el.indeterminate = someAvailableSelected && !allAvailableSelected; }}
                            onChange={toggleAll}
                            className={cn(
                              "rounded border-gray-300",
                              !hasAvailableScenarios && "opacity-50"
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{group.testCaseTitle}</div>
                            {group.folderName && (
                              <div className="text-xs text-[hsl(var(--muted-foreground))]">{group.folderName}</div>
                            )}
                          </div>
                          <span className="text-xs text-[hsl(var(--muted-foreground))]">
                            {group.inRunCount > 0 ? (
                              <span className="text-brand-600 dark:text-brand-400">
                                {group.inRunCount} of {group.scenarios.length} in run
                              </span>
                            ) : (
                              <span>{group.scenarios.length} scenario{group.scenarios.length !== 1 ? "s" : ""}</span>
                            )}
                          </span>
                        </div>
                        {/* Scenarios */}
                        {group.scenarios.map((scenario) => (
                          scenario.inRun ? (
                            <div
                              key={scenario.id}
                              className="flex items-center gap-3 p-3 pl-9 bg-muted/20 opacity-60"
                            >
                              <div className="w-4 h-4 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
                                <CheckIcon className="w-3 h-3 text-brand-600 dark:text-brand-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm">{scenario.title}</div>
                              </div>
                              <span className="text-xs text-brand-600 dark:text-brand-400 font-medium">
                                In run
                              </span>
                            </div>
                          ) : (
                            <label
                              key={scenario.id}
                              className={cn(
                                "flex items-center gap-3 p-3 pl-9 cursor-pointer hover:bg-[hsl(var(--muted))]",
                                selectedToAdd.has(scenario.id) && "bg-brand-50 dark:bg-brand-900/20"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={selectedToAdd.has(scenario.id)}
                                onChange={() => toggleAddSelection(scenario.id)}
                                className="rounded border-gray-300"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm">{scenario.title}</div>
                              </div>
                            </label>
                          )
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedToAdd.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowAddScenarios(false);
                    setSelectedToAdd(new Set());
                    setScenarioSearch("");
                  }}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
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
        </div>
      )}

      {/* Complete Run Confirmation Modal */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCompleteConfirm(false)}
          />
          {/* Modal */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              className="relative bg-background rounded-xl shadow-xl border border-border w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-lg font-semibold">
                  {stats.pending === 0 ? "All Tests Complete!" : "Complete Test Run"}
                </h2>
              </div>
              <button
                onClick={() => setShowCompleteConfirm(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>

              <div className="px-6 py-4 space-y-3">
                {stats.pending === 0 ? (
                  <>
                    <p className="text-sm text-foreground">
                      Great job! All {stats.total} scenario{stats.total !== 1 ? "s have" : " has"} been tested.
                    </p>
                    <div className="flex items-center gap-4 py-2 text-sm">
                      <span className="text-emerald-600 font-medium">{stats.passed} passed</span>
                      {stats.failed > 0 && <span className="text-rose-500 font-medium">{stats.failed} failed</span>}
                      {stats.blocked > 0 && <span className="text-orange-600 font-medium">{stats.blocked} blocked</span>}
                      {stats.skipped > 0 && <span className="text-gray-500 font-medium">{stats.skipped} skipped</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Would you like to mark this run as complete?
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-foreground">
                      Are you sure you want to complete this test run?
                    </p>
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>This will:</p>
                      <ul className="list-disc list-inside space-y-1 ml-2">
                        <li>Mark the test run as completed</li>
                        <li>Lock the run from further changes</li>
                        <li>Leave {stats.pending} scenario{stats.pending !== 1 ? "s" : ""} as pending</li>
                      </ul>
                    </div>
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
                      This action cannot be undone.
                    </p>
                  </>
                )}
              </div>

              <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowCompleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {stats.pending === 0 ? "Not Yet" : "Cancel"}
                </button>
                <button
                  onClick={() => {
                    setShowCompleteConfirm(false);
                    handleComplete();
                  }}
                  disabled={isPending}
                  className={cn(
                    "px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50",
                    stats.pending === 0
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  {stats.pending === 0 ? "Yes, Complete Run" : "Complete Run"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bug Spawn Modal */}
      {showBugSpawnModal && (() => {
        const targetResult = results.find(r => r.id === bugSpawnTargetResultId);
        const targetTitle = targetResult
          ? (targetResult.scenarioTitleSnapshot || targetResult.scenarioTitle)
          : "this scenario";
        return (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => { setShowBugSpawnModal(false); setBugSpawnTargetResultId(null); setBugSpawnError(null); }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              className="relative bg-background rounded-2xl shadow-xl border border-border w-full max-w-md animate-slide-up overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Accent top bar */}
              <div className="h-1 bg-gradient-to-r from-brand-500 via-rose-500 to-rose-400" />

              <button
                onClick={() => { setShowBugSpawnModal(false); setBugSpawnTargetResultId(null); setBugSpawnError(null); }}
                className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors z-10"
              >
                <CloseIcon className="w-4 h-4" />
              </button>

              <div className="px-6 pt-5 pb-4">
                {/* Icon + Title */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center flex-shrink-0">
                    <BugIcon className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-foreground">Log a bug for this failure?</h2>
                    <p className="text-sm text-muted-foreground mt-0.5 truncate" title={targetTitle}>{targetTitle}</p>
                  </div>
                </div>

                {/* What will happen */}
                <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 space-y-2.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">What happens</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2.5 text-sm">
                      <LinearIcon className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
                      <span className="text-foreground">A sub-issue is created on <span className="font-medium text-brand-600 dark:text-brand-400">{run.linearIssueIdentifier}</span></span>
                    </div>
                    <div className="flex items-start gap-2.5 text-sm">
                      <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5 text-rose-500">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
                      </span>
                      <span className="text-foreground">Tagged with the <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300">Bug</span> label</span>
                    </div>
                    <div className="flex items-start gap-2.5 text-sm">
                      <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5 text-muted-foreground">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                      </span>
                      <span className="text-foreground">Includes steps, notes &amp; screenshot references</span>
                    </div>
                  </div>
                </div>

                {bugSpawnError && (
                  <div className="mt-3 flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2.5 border border-rose-200 dark:border-rose-800/50">
                    <WarningIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{bugSpawnError}</span>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-2 bg-muted/30">
                <button
                  onClick={() => { setShowBugSpawnModal(false); setBugSpawnTargetResultId(null); setBugSpawnError(null); }}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
                >
                  Not now
                </button>
                <button
                  onClick={handleSpawnBug}
                  disabled={bugSpawnPending}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm transition-colors"
                >
                  {bugSpawnPending ? (
                    <>
                      <LoadingIcon className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <BugIcon className="w-4 h-4" />
                      Create bug ticket
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Screenshot Lightbox */}
      {screenshotLightbox && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out"
          onClick={() => setScreenshotLightbox(null)}
        >
          <img
            src={screenshotLightbox}
            alt="Screenshot"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
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

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
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

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
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

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
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

function DragHandleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function BugIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0112 12.75zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 01-1.152-6.135 3.001 3.001 0 00-2.32-2.862 7.516 7.516 0 00-1.59-.29A7.496 7.496 0 0012 4.5a7.496 7.496 0 00-3.145.803 7.516 7.516 0 00-1.59.29 3.001 3.001 0 00-2.32 2.862 23.91 23.91 0 01-1.152 6.135A23.893 23.893 0 0112 12.75zM2.695 18.103a21.116 21.116 0 01.713-6.162A4.503 4.503 0 001.5 8.25a.75.75 0 01.75-.75 4.5 4.5 0 014.243 3M21.305 18.103a21.116 21.116 0 00-.713-6.162A4.503 4.503 0 0022.5 8.25a.75.75 0 00-.75-.75 4.5 4.5 0 00-4.243 3" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  );
}
