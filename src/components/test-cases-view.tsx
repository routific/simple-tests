"use client";

import { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { SlidePanel } from "@/components/ui/slide-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScenarioAccordion } from "@/components/scenario-accordion";
import {
  saveTestCase,
  deleteTestCase,
  bulkDeleteTestCases,
  bulkUpdateTestCaseState,
  bulkMoveTestCasesToFolder,
  reorderTestCases,
} from "@/app/cases/actions";
import { exportTestCases, importTestCases, ExportData } from "@/app/cases/export-actions";
import { getScenarios } from "@/app/cases/scenario-actions";
import { getLastUndo, getLastRedo, getUndoStack, getRedoStack, executeUndo, executeRedo } from "@/app/cases/undo-actions";
import { cn } from "@/lib/utils";
import { buildFolderBreadcrumb, formatBreadcrumb } from "@/lib/folders";
import { FolderPicker } from "@/components/folder-picker";

// Helper to format time ago
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
}

interface Scenario {
  id: number;
  title: string;
  gherkin: string;
  order: number;
}

interface TestCase {
  id: number;
  title: string;
  state: string;
  template: string;
  scenarioCount?: number;
  order?: number;
  updatedAt: Date | null;
  folderName: string | null;
  folderId?: number | null;
}

interface Folder {
  id: number;
  name: string;
  parentId: number | null;
}

interface TestCasesViewProps {
  cases: TestCase[];
  folders: Folder[];
  currentFolderId: number | null;
  currentFolderName: string | null;
  search: string;
  stateFilter: string;
  totalCount: number;
  hasMore: boolean;
  currentOffset: number;
  /** When viewing a folder, this contains all descendant folder IDs (including the selected one) */
  selectedFolderIds?: number[] | null;
  /** Initial case ID from URL for deep-linking */
  initialSelectedCaseId?: number | null;
}

export function TestCasesView({
  cases,
  folders,
  currentFolderId,
  currentFolderName,
  search,
  stateFilter,
  totalCount,
  hasMore,
  currentOffset,
  selectedFolderIds,
  initialSelectedCaseId,
}: TestCasesViewProps) {
  const router = useRouter();
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<TestCase | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const initializedRef = useRef(false);
  const [selectedCases, setSelectedCases] = useState<Set<number>>(new Set());
  const lastSelectedIndexRef = useRef<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);
  const [lastUndoAction, setLastUndoAction] = useState<{ id: number; description: string } | null>(null);
  const [lastRedoAction, setLastRedoAction] = useState<{ id: number; description: string } | null>(null);
  const [undoStackItems, setUndoStackItems] = useState<Array<{ id: number; description: string; actionType: string; createdAt: Date }>>([]);
  const [redoStackItems, setRedoStackItems] = useState<Array<{ id: number; description: string; actionType: string; createdAt: Date }>>([]);
  const [showUndoDropdown, setShowUndoDropdown] = useState(false);
  const [showRedoDropdown, setShowRedoDropdown] = useState(false);
  const undoDropdownRef = useRef<HTMLDivElement>(null);
  const redoDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch last undo/redo actions on mount and after changes
  const refreshUndoRedo = async () => {
    const [lastUndo, lastRedo, undoItems, redoItems] = await Promise.all([
      getLastUndo(),
      getLastRedo(),
      getUndoStack(),
      getRedoStack(),
    ]);
    setLastUndoAction(lastUndo);
    setLastRedoAction(lastRedo);
    setUndoStackItems(undoItems);
    setRedoStackItems(redoItems);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (undoDropdownRef.current && !undoDropdownRef.current.contains(e.target as Node)) {
        setShowUndoDropdown(false);
      }
      if (redoDropdownRef.current && !redoDropdownRef.current.contains(e.target as Node)) {
        setShowRedoDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    refreshUndoRedo();
  }, [cases]); // Refresh when cases change

  // Handle deep-link: open panel for initial case ID from URL
  useEffect(() => {
    if (initializedRef.current) return;
    if (initialSelectedCaseId && cases.length > 0) {
      const testCase = cases.find((c) => c.id === initialSelectedCaseId);
      if (testCase) {
        setSelectedCase(testCase);
        setIsPanelOpen(true);
        initializedRef.current = true;
      }
    }
  }, [initialSelectedCaseId, cases]);

  const handleUndo = async () => {
    if (isUndoing || !lastUndoAction) return;
    setIsUndoing(true);
    try {
      const result = await executeUndo();
      if (result.error) {
        alert(`Undo failed: ${result.error}`);
      } else if (result.description) {
        // Refresh to show changes
        router.refresh();
        refreshUndoRedo();
      }
    } catch {
      alert("Undo failed. Please try again.");
    } finally {
      setIsUndoing(false);
    }
  };

  const handleRedo = async () => {
    if (isRedoing || !lastRedoAction) return;
    setIsRedoing(true);
    try {
      const result = await executeRedo();
      if (result.error) {
        alert(`Redo failed: ${result.error}`);
      } else if (result.description) {
        // Refresh to show changes
        router.refresh();
        refreshUndoRedo();
      }
    } catch {
      alert("Redo failed. Please try again.");
    } finally {
      setIsRedoing(false);
    }
  };

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if we're in an input/textarea (don't intercept typing)
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        return;
      }

      // CMD+Z (Mac) or Ctrl+Z (Windows) for undo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // CMD+Shift+Z (Mac) or Ctrl+Shift+Z (Windows) for redo
      else if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
      // CMD+Y (Windows-style redo)
      else if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lastUndoAction, lastRedoAction, isUndoing, isRedoing]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportTestCases();
      if (result.error) {
        alert(`Export failed: ${result.error}`);
        return;
      }
      if (result.data) {
        // Create and download the JSON file
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const date = new Date().toISOString().split("T")[0];
        a.download = `test-cases-export-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      alert("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ExportData;

      if (
        !confirm(
          `This will replace all existing test cases with ${data.data.testCases.length} test cases from the import file. Continue?`
        )
      ) {
        setIsImporting(false);
        return;
      }

      const result = await importTestCases(data);
      if (result.error) {
        alert(`Import failed: ${result.error}`);
        return;
      }
      if (result.stats) {
        alert(
          `Import successful!\n\nImported:\n- ${result.stats.folders} folders\n- ${result.stats.testCases} test cases\n- ${result.stats.scenarios} scenarios`
        );
        router.refresh();
      }
    } catch {
      alert("Import failed. Please check the file format.");
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCaseClick = (testCase: TestCase) => {
    setSelectedCase(testCase);
    setIsPanelOpen(true);
    // Update URL with case ID for deep-linking
    const params = new URLSearchParams(window.location.search);
    params.set("case", String(testCase.id));
    router.replace(`/cases?${params.toString()}`, { scroll: false });
  };

  const toggleCaseSelection = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentIndex = cases.findIndex((c) => c.id === id);

    // Shift+click: select range from last selected to current
    if (e.shiftKey && lastSelectedIndexRef.current !== null) {
      const start = Math.min(lastSelectedIndexRef.current, currentIndex);
      const end = Math.max(lastSelectedIndexRef.current, currentIndex);
      const newSelected = new Set(selectedCases);
      for (let i = start; i <= end; i++) {
        newSelected.add(cases[i].id);
      }
      setSelectedCases(newSelected);
    } else {
      // Regular click: toggle single item
      const newSelected = new Set(selectedCases);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      setSelectedCases(newSelected);
      lastSelectedIndexRef.current = currentIndex;
    }
  };

  const selectAllCases = () => {
    setSelectedCases(new Set(cases.map((c) => c.id)));
  };

  const clearSelection = () => {
    setSelectedCases(new Set());
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setTimeout(() => setSelectedCase(null), 300); // Clear after animation
    // Remove case ID from URL
    const params = new URLSearchParams(window.location.search);
    params.delete("case");
    const newUrl = params.toString() ? `/cases?${params.toString()}` : "/cases";
    router.replace(newUrl, { scroll: false });
  };

  const handleCaseSaved = () => {
    router.refresh();
  };

  const handleCaseDeleted = () => {
    handleClosePanel();
    router.refresh();
  };

  return (
    <>
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between bg-background">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {currentFolderName || "All Test Cases"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalCount} test case{totalCount !== 1 ? "s" : ""}
            {hasMore && ` (showing ${cases.length})`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUndoAction && (
            <div className="relative" ref={undoDropdownRef}>
              <div className="flex items-center">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleUndo}
                  disabled={isUndoing}
                  className="text-muted-foreground hover:text-foreground rounded-r-none pr-1"
                  title={`Undo: ${lastUndoAction.description} (${navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Z)`}
                >
                  {isUndoing ? (
                    <LoadingIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <UndoIcon className="w-4 h-4" />
                  )}
                  Undo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowUndoDropdown(!showUndoDropdown)}
                  className="text-muted-foreground hover:text-foreground rounded-l-none pl-0 pr-1"
                >
                  <ChevronDownIcon className="w-3 h-3" />
                </Button>
              </div>
              {showUndoDropdown && undoStackItems.length > 0 && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-popover border border-border rounded-md shadow-lg z-50">
                  <div className="p-2 text-xs font-medium text-muted-foreground border-b border-border">
                    Undo History
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {undoStackItems.map((item, index) => (
                      <div
                        key={item.id}
                        className={cn(
                          "px-3 py-2 text-sm",
                          index === 0 ? "bg-accent/50" : "hover:bg-accent/30"
                        )}
                      >
                        <div className="font-medium truncate">{item.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatTimeAgo(item.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {lastRedoAction && (
            <div className="relative" ref={redoDropdownRef}>
              <div className="flex items-center">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRedo}
                  disabled={isRedoing}
                  className="text-muted-foreground hover:text-foreground rounded-r-none pr-1"
                  title={`Redo: ${lastRedoAction.description} (${navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Shift+Z)`}
                >
                  {isRedoing ? (
                    <LoadingIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <RedoIcon className="w-4 h-4" />
                  )}
                  Redo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowRedoDropdown(!showRedoDropdown)}
                  className="text-muted-foreground hover:text-foreground rounded-l-none pl-0 pr-1"
                >
                  <ChevronDownIcon className="w-3 h-3" />
                </Button>
              </div>
              {showRedoDropdown && redoStackItems.length > 0 && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-popover border border-border rounded-md shadow-lg z-50">
                  <div className="p-2 text-xs font-medium text-muted-foreground border-b border-border">
                    Redo History
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {redoStackItems.map((item, index) => (
                      <div
                        key={item.id}
                        className={cn(
                          "px-3 py-2 text-sm",
                          index === 0 ? "bg-accent/50" : "hover:bg-accent/30"
                        )}
                      >
                        <div className="font-medium truncate">{item.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatTimeAgo(item.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleImportClick}
            disabled={isImporting}
          >
            {isImporting ? (
              <LoadingIcon className="w-4 h-4 animate-spin" />
            ) : (
              <ImportIcon className="w-4 h-4" />
            )}
            {isImporting ? "Importing..." : "Import"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <LoadingIcon className="w-4 h-4 animate-spin" />
            ) : (
              <ExportIcon className="w-4 h-4" />
            )}
            {isExporting ? "Exporting..." : "Export"}
          </Button>
          <Button size="sm" onClick={() => setIsNewCaseModalOpen(true)}>
            <PlusIcon className="w-4 h-4" />
            New Case
          </Button>
        </div>
      </div>

      {/* Test Case List */}
      <TestCaseListContent
        cases={cases}
        folders={folders}
        currentFolderId={currentFolderId}
        search={search}
        selectedCases={selectedCases}
        hasMore={hasMore}
        currentOffset={currentOffset}
        selectedFolderIds={selectedFolderIds}
        onCaseClick={handleCaseClick}
        onToggleSelection={toggleCaseSelection}
        onSelectAll={selectAllCases}
        onClearSelection={clearSelection}
        onSelectionAction={() => {
          clearSelection();
          router.refresh();
        }}
        onSearchChange={(value) => {
          const params = new URLSearchParams(window.location.search);
          if (value) {
            params.set("q", value);
          } else {
            params.delete("q");
          }
          // Reset offset when search changes
          params.delete("offset");
          router.push(`/cases?${params.toString()}`);
        }}
        onLoadMore={() => {
          const params = new URLSearchParams(window.location.search);
          params.set("offset", String(currentOffset + 100));
          router.push(`/cases?${params.toString()}`);
        }}
      />

      {/* New Case Modal */}
      <NewCaseModal
        isOpen={isNewCaseModalOpen}
        onClose={() => setIsNewCaseModalOpen(false)}
        folders={folders}
        currentFolderId={currentFolderId}
        currentFolderName={currentFolderName}
        onSaved={handleCaseSaved}
      />

      {/* Test Case Detail Panel */}
      <TestCasePanel
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
        testCase={selectedCase}
        folders={folders}
        onSaved={handleCaseSaved}
        onDeleted={handleCaseDeleted}
      />
    </>
  );
}

// Test Case List Content
const STATE_OPTIONS = ["active", "draft", "retired", "rejected"] as const;
type TestCaseState = (typeof STATE_OPTIONS)[number];

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

// Status Dropdown Component
function StatusDropdown({
  testCaseId,
  currentState,
  onStateChange,
}: {
  testCaseId: number;
  currentState: string;
  onStateChange: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleStateSelect = (state: TestCaseState) => {
    if (state === currentState) {
      setIsOpen(false);
      return;
    }
    startTransition(async () => {
      await bulkUpdateTestCaseState([testCaseId], state);
      setIsOpen(false);
      onStateChange();
    });
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        disabled={isPending}
        className="cursor-pointer"
      >
        <Badge
          variant={getStateBadgeVariant(currentState)}
          className={cn(
            "transition-all",
            isPending && "opacity-50",
            !isPending && "hover:ring-2 hover:ring-offset-1 hover:ring-brand-500/50"
          )}
        >
          {isPending ? "..." : currentState}
        </Badge>
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[120px]">
          {STATE_OPTIONS.map((state) => (
            <button
              key={state}
              onClick={(e) => {
                e.stopPropagation();
                handleStateSelect(state);
              }}
              className={cn(
                "w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 hover:bg-muted transition-colors",
                state === currentState && "bg-muted/50"
              )}
            >
              <Badge variant={getStateBadgeVariant(state)} className="text-xs">
                {state}
              </Badge>
              {state === currentState && (
                <CheckIcon className="w-3 h-3 text-muted-foreground ml-auto" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Inline folder picker wrapper that handles the move action
function InlineFolderPicker({
  testCaseId,
  currentFolderId,
  folders,
  onFolderChange,
}: {
  testCaseId: number;
  currentFolderId: number | null;
  folders: Folder[];
  onFolderChange: () => void;
}) {
  const [, startTransition] = useTransition();

  const handleChange = (folderId: number | null) => {
    if (folderId === currentFolderId) return;
    startTransition(async () => {
      await bulkMoveTestCasesToFolder([testCaseId], folderId);
      onFolderChange();
    });
  };

  return (
    <FolderPicker
      folders={folders}
      value={currentFolderId}
      onChange={handleChange}
      placeholder="No folder"
      variant="inline"
    />
  );
}

function TestCaseListContent({
  cases,
  folders,
  currentFolderId,
  search,
  selectedCases,
  hasMore,
  currentOffset,
  selectedFolderIds,
  onCaseClick,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onSelectionAction,
  onSearchChange,
  onLoadMore,
}: {
  cases: TestCase[];
  folders: Folder[];
  currentFolderId: number | null;
  search: string;
  selectedCases: Set<number>;
  hasMore: boolean;
  currentOffset: number;
  selectedFolderIds?: number[] | null;
  onCaseClick: (testCase: TestCase) => void;
  onToggleSelection: (id: number, e: React.MouseEvent) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onSelectionAction: () => void;
  onSearchChange: (value: string) => void;
  onLoadMore: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ id: number; position: "before" | "after" } | null>(null);
  const [showStateModal, setShowStateModal] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // CMD+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleBulkDelete = () => {
    if (!confirm(`Delete ${selectedCases.size} test case(s)? You can undo this action.`)) {
      return;
    }

    startTransition(async () => {
      await bulkDeleteTestCases(Array.from(selectedCases));
      onSelectionAction();
    });
  };

  const handleBulkStateChange = (state: "active" | "draft" | "retired" | "rejected") => {
    startTransition(async () => {
      await bulkUpdateTestCaseState(Array.from(selectedCases), state);
      setShowStateModal(false);
      onSelectionAction();
    });
  };

  const handleBulkMove = (folderId: number | null) => {
    startTransition(async () => {
      await bulkMoveTestCasesToFolder(Array.from(selectedCases), folderId);
      setShowMoveModal(false);
      onSelectionAction();
    });
  };

  const handleDragStart = (id: number) => {
    setDraggedId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (draggedId === null || draggedId === id) return;

    // Calculate if dropping before or after based on mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "before" : "after";

    setDropIndicator({ id, position });
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the container, not entering a child
    const relatedTarget = e.relatedTarget as Node | null;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDropIndicator(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedId === null || !dropIndicator) {
      setDraggedId(null);
      setDropIndicator(null);
      return;
    }

    const targetId = dropIndicator.id;
    if (draggedId === targetId) {
      setDraggedId(null);
      setDropIndicator(null);
      return;
    }

    // Calculate new order
    const currentIds = cases.map((c) => c.id);
    const fromIndex = currentIds.indexOf(draggedId);
    let toIndex = currentIds.indexOf(targetId);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedId(null);
      setDropIndicator(null);
      return;
    }

    // Adjust target index based on drop position
    if (dropIndicator.position === "after") {
      toIndex += 1;
    }
    // If dragging from before to after, adjust for the removal
    if (fromIndex < toIndex) {
      toIndex -= 1;
    }

    // Reorder the array
    const newIds = [...currentIds];
    newIds.splice(fromIndex, 1);
    newIds.splice(toIndex, 0, draggedId);

    // Persist the new order
    startTransition(async () => {
      await reorderTestCases(currentFolderId, newIds);
      onSelectionAction();
    });

    setDraggedId(null);
    setDropIndicator(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDropIndicator(null);
  };

  const allSelected = cases.length > 0 && selectedCases.size === cases.length;
  const someSelected = selectedCases.size > 0 && selectedCases.size < cases.length;

  return (
    <div>
      {/* Bulk Action Toolbar - floating pill at bottom when items selected */}
      {selectedCases.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-2 py-1.5 bg-white dark:bg-zinc-900 border border-border rounded-xl shadow-xl flex items-center gap-1">
          <div className="px-3 py-1.5 flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-brand-500 text-white flex items-center justify-center text-xs font-bold">
              {selectedCases.size}
            </div>
            <span className="text-sm font-medium text-foreground">selected</span>
          </div>
          <div className="w-px h-6 bg-border" />
          <button
            onClick={() => {
              const ids = Array.from(selectedCases).join(",");
              window.location.href = `/runs/new?cases=${ids}`;
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors"
          >
            <PlayIcon className="w-4 h-4" />
            Create Run
          </button>
          <button
            onClick={() => setShowStateModal(true)}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <StateIcon className="w-4 h-4" />
            Change State
          </button>
          <button
            onClick={() => setShowMoveModal(true)}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-foreground rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <MoveIcon className="w-4 h-4" />
            Move Folder
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-destructive rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <TrashIcon className="w-4 h-4" />
            Delete
          </button>
          <div className="w-px h-6 bg-border" />
          <button
            onClick={onClearSelection}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            title="Clear selection"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

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
                onClearSelection();
              } else {
                onSelectAll();
              }
            }}
            className="rounded border-input text-brand-600 focus:ring-brand-500 dark:border-muted-foreground/30 dark:bg-muted/50"
            title={allSelected ? "Deselect all" : "Select all"}
          />
        </div>
        <div className="flex-1 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search test cases... (⌘K)"
            defaultValue={search}
            onChange={(e) => {
              const value = e.target.value;
              if (value.length === 0 || value.length >= 2) {
                onSearchChange(value);
              }
            }}
            className="pl-9"
          />
        </div>
      </div>

      {/* State Change Modal */}
      {showStateModal && (
        <Modal
          isOpen={showStateModal}
          onClose={() => setShowStateModal(false)}
          title="Change State"
          description={`Update state for ${selectedCases.size} test case(s)`}
        >
          <div className="p-6 space-y-2">
            {(["active", "draft", "retired", "rejected"] as const).map((state) => (
              <button
                key={state}
                onClick={() => handleBulkStateChange(state)}
                disabled={isPending}
                className="w-full p-3 text-left rounded-lg hover:bg-muted transition-colors flex items-center gap-3"
              >
                <Badge variant={getStateBadgeVariant(state)}>{state}</Badge>
                <span className="text-sm text-muted-foreground capitalize">
                  Set all to {state}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Move to Folder Modal */}
      {showMoveModal && (
        <Modal
          isOpen={showMoveModal}
          onClose={() => setShowMoveModal(false)}
          title="Move to Folder"
          description={`Move ${selectedCases.size} test case(s) to a folder`}
        >
          <div className="p-6 min-h-[400px]">
            <FolderPicker
              folders={folders}
              value={null}
              onChange={(folderId) => handleBulkMove(folderId)}
              placeholder="Select folder..."
            />
            <div className="mt-4 pt-4 border-t border-border">
              <button
                onClick={() => handleBulkMove(null)}
                disabled={isPending}
                className="w-full p-3 text-left rounded-lg hover:bg-muted transition-colors text-sm text-muted-foreground"
              >
                Remove from folder (move to root)
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Results */}
      {cases.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <SearchIcon className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">No test cases found</p>
          <p className="text-sm text-muted-foreground">
            {search
              ? "Try a different search term."
              : "Create your first test case to get started."}
          </p>
        </div>
      ) : (
        <GroupedTestCaseList
          cases={cases}
          folders={folders}
          currentFolderId={currentFolderId}
          selectedFolderIds={selectedFolderIds}
          selectedCases={selectedCases}
          draggedId={draggedId}
          dropIndicator={dropIndicator}
          onCaseClick={onCaseClick}
          onToggleSelection={onToggleSelection}
          onSelectionAction={onSelectionAction}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      )}
      {hasMore && (
        <div className="p-4 border-t border-border">
          <Button
            variant="outline"
            className="w-full"
            onClick={onLoadMore}
          >
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}

// Grouped Test Case List - renders test cases with folder subsection dividers
function GroupedTestCaseList({
  cases,
  folders,
  currentFolderId,
  selectedFolderIds,
  selectedCases,
  draggedId,
  dropIndicator,
  onCaseClick,
  onToggleSelection,
  onSelectionAction,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  cases: TestCase[];
  folders: Folder[];
  currentFolderId: number | null;
  selectedFolderIds?: number[] | null;
  selectedCases: Set<number>;
  draggedId: number | null;
  dropIndicator: { id: number; position: "before" | "after" } | null;
  onCaseClick: (testCase: TestCase) => void;
  onToggleSelection: (id: number, e: React.MouseEvent) => void;
  onSelectionAction: () => void;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, id: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  // Track collapsed folder groups
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number | null>>(new Set());

  const toggleGroupCollapse = (folderId: number | null) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Check if we're showing cases from multiple folders (parent + children)
  const showFolderGroups = selectedFolderIds && selectedFolderIds.length > 1;

  // Group cases by folder
  const groupedCases = useMemo(() => {
    if (!showFolderGroups) {
      return [{ folderId: currentFolderId, folderName: null, cases }];
    }

    // Build folder lookup
    const folderMap = new Map(folders.map((f) => [f.id, f]));

    // Get relative path from current folder to target folder
    const getRelativePath = (folderId: number | null): string => {
      if (!folderId || folderId === currentFolderId) return "";

      const path: string[] = [];
      let currentId: number | null = folderId;

      while (currentId !== null && currentId !== currentFolderId) {
        const folder = folderMap.get(currentId);
        if (!folder) break;
        path.unshift(folder.name);
        currentId = folder.parentId;
      }

      return path.join(" / ");
    };

    // Group cases by folderId
    const groups = new Map<number | null, { cases: TestCase[]; path: string }>();

    // First, add group for current folder
    groups.set(currentFolderId, { cases: [], path: "" });

    cases.forEach((testCase) => {
      const fid = testCase.folderId ?? null;
      if (!groups.has(fid)) {
        groups.set(fid, { cases: [], path: getRelativePath(fid) });
      }
      groups.get(fid)!.cases.push(testCase);
    });

    // Convert to array and sort: current folder first, then by path
    const result: { folderId: number | null; folderName: string | null; cases: TestCase[] }[] = [];

    // Add current folder group first (if it has cases)
    const currentGroup = groups.get(currentFolderId);
    if (currentGroup && currentGroup.cases.length > 0) {
      result.push({ folderId: currentFolderId, folderName: null, cases: currentGroup.cases });
    }

    // Add child folder groups
    groups.forEach((group, fid) => {
      if (fid !== currentFolderId && group.cases.length > 0) {
        result.push({ folderId: fid, folderName: group.path, cases: group.cases });
      }
    });

    return result;
  }, [cases, folders, currentFolderId, showFolderGroups]);

  return (
    <div>
      {groupedCases.map((group, groupIndex) => {
        const isCollapsed = collapsedGroups.has(group.folderId);

        return (
        <div key={group.folderId ?? "root"}>
          {/* Folder subsection divider */}
          {showFolderGroups && group.folderName && (
            <button
              onClick={() => toggleGroupCollapse(group.folderId)}
              className="w-full flex items-center gap-2 pl-6 pr-4 py-2.5 bg-muted/70 dark:bg-muted/40 border-y border-border hover:bg-muted transition-colors text-left"
            >
              <ChevronIcon
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground transition-transform",
                  !isCollapsed && "rotate-90"
                )}
              />
              <SubfolderIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                {group.folderName}
              </span>
              <span className="text-xs text-muted-foreground/60">
                ({group.cases.length})
              </span>
            </button>
          )}
          {!isCollapsed && (
          <div className={cn("divide-y divide-border", showFolderGroups && group.folderName && "ml-4 border-l-2 border-muted")}>
            {group.cases.map((testCase) => (
              <div key={testCase.id} className="relative">
                {/* Drop indicator line - before */}
                {dropIndicator?.id === testCase.id && dropIndicator.position === "before" && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-brand-500 z-10">
                    <div className="absolute -left-0.5 -top-1 w-2.5 h-2.5 rounded-full bg-brand-500" />
                  </div>
                )}
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData(
                      "text/plain",
                      JSON.stringify({ type: "testcase", id: testCase.id, name: testCase.title })
                    );
                    (window as unknown as { __draggedTestCase?: { id: number; name: string } }).__draggedTestCase = {
                      id: testCase.id,
                      name: testCase.title,
                    };
                    onDragStart(testCase.id);
                  }}
                  onDragEnd={() => {
                    delete (window as unknown as { __draggedTestCase?: { id: number; name: string } }).__draggedTestCase;
                    onDragEnd();
                  }}
                  onDragOver={(e) => onDragOver(e, testCase.id)}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => onCaseClick(testCase)}
                  className={cn(
                    "w-full flex items-center justify-between py-2.5 px-4 hover:bg-muted/50 transition-colors group text-left",
                    "cursor-grab active:cursor-grabbing",
                    selectedCases.has(testCase.id) && "bg-brand-50 dark:bg-brand-950/50",
                    draggedId === testCase.id && "opacity-50"
                  )}
                >
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <div
                      className="p-2 -m-2 cursor-pointer flex-shrink-0"
                      onClick={(e) => onToggleSelection(testCase.id, e)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCases.has(testCase.id)}
                        onChange={() => {}}
                        className="rounded border-input text-brand-600 focus:ring-brand-500 dark:border-muted-foreground/30 dark:bg-muted/50 pointer-events-none"
                      />
                    </div>
                    <DragHandleIcon className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="text-foreground truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {testCase.title}
                    </span>
                  </div>
                  <div className="grid grid-cols-[24px_70px_40px_20px] lg:grid-cols-[160px_70px_40px_20px] gap-2 items-center ml-4 flex-shrink-0">
                    {/* Folder: icon only on small screens, full picker on lg+ */}
                    <div className="flex justify-end">
                      <div className="lg:hidden relative group/folder">
                        {testCase.folderId ? (
                          <>
                            <span className="text-muted-foreground hover:text-foreground transition-colors cursor-default">
                              <FolderIcon className="w-4 h-4" />
                            </span>
                            <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover/folder:block">
                              <div className="bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-md border border-border whitespace-nowrap">
                                {folders.find(f => f.id === testCase.folderId)?.name || "Folder"}
                              </div>
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground/30">
                            <FolderIcon className="w-4 h-4" />
                          </span>
                        )}
                      </div>
                      <div className="hidden lg:block">
                        <InlineFolderPicker
                          testCaseId={testCase.id}
                          currentFolderId={testCase.folderId ?? null}
                          folders={folders}
                          onFolderChange={onSelectionAction}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <StatusDropdown
                        testCaseId={testCase.id}
                        currentState={testCase.state}
                        onStateChange={onSelectionAction}
                      />
                    </div>
                    <span
                      className="text-xs text-muted-foreground flex items-center gap-1 justify-end tabular-nums"
                      title={`${testCase.scenarioCount || 0} scenario${testCase.scenarioCount !== 1 ? 's' : ''}`}
                    >
                      <ScenarioIcon className="w-3 h-3" />
                      {testCase.scenarioCount || 0}
                    </span>
                    <ChevronRightIcon className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
                {/* Drop indicator line - after */}
                {dropIndicator?.id === testCase.id && dropIndicator.position === "after" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 z-10">
                    <div className="absolute -left-0.5 -top-1 w-2.5 h-2.5 rounded-full bg-brand-500" />
                  </div>
                )}
              </div>
            ))}
          </div>
          )}
        </div>
      );
      })}
    </div>
  );
}

// Subfolder icon for section dividers
function SubfolderIcon({ className }: { className?: string }) {
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
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

// Chevron icon for collapsible sections
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

// New Case Modal
function NewCaseModal({
  isOpen,
  onClose,
  folders,
  currentFolderId,
  currentFolderName,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  folders: Folder[];
  currentFolderId: number | null;
  currentFolderName: string | null;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<number | null>(currentFolderId);
  const [state, setState] = useState<string>("active");
  const [error, setError] = useState<string | null>(null);

  // Sync folderId when modal opens or currentFolderId changes
  useEffect(() => {
    if (isOpen) {
      setFolderId(currentFolderId);
    }
  }, [isOpen, currentFolderId]);

  const handleSave = () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await saveTestCase({
          title: title.trim(),
          folderId: folderId,
          state: state as "active" | "draft" | "retired" | "rejected",
        });

        if (result.error) {
          setError(result.error);
        } else if (result.id) {
          // Reset form and close
          setTitle("");
          setState("active");
          setError(null);
          onClose();
          onSaved();
        }
      } catch {
        setError("Failed to save test case");
      }
    });
  };

  // Reset folder when modal opens
  const handleClose = () => {
    setTitle("");
    setFolderId(currentFolderId);
    setState("active");
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Test Case"
      description={
        currentFolderName
          ? `Creating in "${currentFolderName}"`
          : "Create a new test case"
      }
    >
      <div className="p-6 flex flex-col min-h-[400px]">
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Title
            </label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., User login with valid credentials"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Folder
              </label>
              <FolderPicker
                folders={folders}
                value={folderId}
                onChange={setFolderId}
                placeholder="No folder"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                State
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="retired">Retired</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-4">
          <p className="text-sm text-muted-foreground mb-4">
            You can add scenarios after creating the test case.
          </p>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Creating..." : "Create Test Case"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Test Case Detail Panel
function TestCasePanel({
  isOpen,
  onClose,
  testCase,
  folders,
  onSaved,
  onDeleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  testCase: TestCase | null;
  folders: Folder[];
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [state, setState] = useState<string>("active");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch scenarios when panel opens
  useEffect(() => {
    if (testCase && isOpen) {
      setLoadingScenarios(true);
      getScenarios(testCase.id)
        .then((data) => {
          setScenarios(data);
        })
        .finally(() => setLoadingScenarios(false));
    }
  }, [testCase?.id, isOpen]);

  // Reset form when test case changes
  const resetForm = () => {
    if (testCase) {
      setTitle(testCase.title);
      setFolderId(testCase.folderId ?? null);
      setState(testCase.state);
    }
    setIsEditing(false);
    setError(null);
  };

  // Reset when panel opens with new test case
  if (testCase && title !== testCase.title && !isEditing) {
    resetForm();
  }

  const handleSave = () => {
    if (!testCase) return;
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        // Save test case metadata
        const result = await saveTestCase({
          id: testCase.id,
          title: title.trim(),
          folderId: folderId,
          state: state as "active" | "draft" | "retired" | "rejected",
        });

        if (result.error) {
          setError(result.error);
          return;
        }

        // Save scenarios using the global function
        const saveScenariosFn = (window as Window & { __saveScenarios?: () => Promise<boolean> }).__saveScenarios;
        if (saveScenariosFn) {
          await saveScenariosFn();
        }

        setIsEditing(false);
        onSaved();
      } catch {
        setError("Failed to save test case");
      }
    });
  };

  const handleDelete = () => {
    if (!testCase) return;
    if (!confirm("Delete this test case? You can undo this action.")) return;

    startTransition(async () => {
      try {
        await deleteTestCase(testCase.id);
        onDeleted();
      } catch {
        setError("Failed to delete test case");
      }
    });
  };

  const handleClose = () => {
    setIsEditing(false);
    setError(null);
    onClose();
  };

  const getStateBadgeVariant = (s: string) => {
    switch (s) {
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
  };

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      title={isEditing ? "Edit Test Case" : "Test Case"}
      width="max-w-2xl"
    >
      {testCase && (
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
              {error}
            </div>
          )}

          {isEditing ? (
            // Edit Mode
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Title
                </label>
                <Input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., User login with valid credentials"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Folder
                  </label>
                  <FolderPicker
                    folders={folders}
                    value={folderId}
                    onChange={setFolderId}
                    placeholder="No folder"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    State
                  </label>
                  <select
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="retired">Retired</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Scenarios
                </label>
                {loadingScenarios ? (
                  <div className="text-sm text-muted-foreground">Loading scenarios...</div>
                ) : (
                  <ScenarioAccordion
                    testCaseId={testCase.id}
                    scenarios={scenarios}
                    isEditing={true}
                    onChange={setScenarios}
                  />
                )}
              </div>

              <div className="flex justify-between pt-4 border-t border-border">
                <Button
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={isPending}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  Delete
                </Button>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetForm();
                      setIsEditing(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={isPending}>
                    {isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            // View Mode
            <div className="space-y-6">
              {/* Title and Status */}
              <div>
                <div className="flex items-start justify-between gap-4">
                  <h3 className="text-xl font-semibold text-foreground">
                    {testCase.title}
                  </h3>
                  <Badge variant={getStateBadgeVariant(testCase.state)}>
                    {testCase.state}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  {testCase.folderId && (
                    <>
                      <FolderIcon className="w-4 h-4" />
                      <span>{formatBreadcrumb(buildFolderBreadcrumb(testCase.folderId, folders))}</span>
                      <span className="text-border">·</span>
                    </>
                  )}
                  {testCase.updatedAt && (
                    <span>
                      Updated{" "}
                      {testCase.updatedAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </div>

              {/* Scenarios */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">
                  Scenarios ({scenarios.length})
                </h4>
                {loadingScenarios ? (
                  <div className="text-sm text-muted-foreground">Loading scenarios...</div>
                ) : (
                  <ScenarioAccordion
                    testCaseId={testCase.id}
                    scenarios={scenarios}
                    isEditing={false}
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end pt-4 border-t border-border">
                <Button onClick={() => setIsEditing(true)}>
                  <EditIcon className="w-4 h-4" />
                  Edit Test Case
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </SlidePanel>
  );
}

// Icons
function PlusIcon({ className }: { className?: string }) {
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
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
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
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
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
        d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
      />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
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
        d="M8.25 4.5l7.5 7.5-7.5 7.5"
      />
    </svg>
  );
}

function DragHandleIcon({ className }: { className?: string }) {
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
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
      />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
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
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

function ExportIcon({ className }: { className?: string }) {
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
        d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15"
      />
    </svg>
  );
}

function ImportIcon({ className }: { className?: string }) {
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
        d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25"
      />
    </svg>
  );
}

function UndoIcon({ className }: { className?: string }) {
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
        d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
      />
    </svg>
  );
}

function RedoIcon({ className }: { className?: string }) {
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
        d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
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
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
      />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
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
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function StateIcon({ className }: { className?: string }) {
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function MoveIcon({ className }: { className?: string }) {
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
        d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
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
        d="M4.5 12.75l6 6 9-13.5"
      />
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

function PlayIcon({ className }: { className?: string }) {
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
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
      />
    </svg>
  );
}
