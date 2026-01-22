"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { SlidePanel } from "@/components/ui/slide-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { GherkinEditor, GherkinDisplay } from "@/components/gherkin-editor";
import { saveTestCase, deleteTestCase } from "@/app/cases/actions";
import { cn } from "@/lib/utils";

interface TestCase {
  id: number;
  title: string;
  state: string;
  template: string;
  gherkin?: string;
  updatedAt: Date | null;
  folderName: string | null;
  folderId?: number | null;
}

interface Folder {
  id: number;
  name: string;
}

interface TestCasesViewProps {
  cases: TestCase[];
  folders: Folder[];
  currentFolderId: number | null;
  currentFolderName: string | null;
  search: string;
  stateFilter: string;
}

export function TestCasesView({
  cases,
  folders,
  currentFolderId,
  currentFolderName,
  search,
  stateFilter,
}: TestCasesViewProps) {
  const router = useRouter();
  const [isNewCaseModalOpen, setIsNewCaseModalOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<TestCase | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const handleCaseClick = (testCase: TestCase) => {
    setSelectedCase(testCase);
    setIsPanelOpen(true);
  };

  const handleClosePanel = () => {
    setIsPanelOpen(false);
    setTimeout(() => setSelectedCase(null), 300); // Clear after animation
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
            {cases.length} test case{cases.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button size="sm" onClick={() => setIsNewCaseModalOpen(true)}>
          <PlusIcon className="w-4 h-4" />
          New Case
        </Button>
      </div>

      {/* Test Case List */}
      <TestCaseListContent
        cases={cases}
        search={search}
        stateFilter={stateFilter}
        onCaseClick={handleCaseClick}
        onSearchChange={(value) => {
          const params = new URLSearchParams(window.location.search);
          if (value) {
            params.set("q", value);
          } else {
            params.delete("q");
          }
          router.push(`/cases?${params.toString()}`);
        }}
        onStateFilterChange={(value) => {
          const params = new URLSearchParams(window.location.search);
          if (value) {
            params.set("state", value);
          } else {
            params.delete("state");
          }
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
function TestCaseListContent({
  cases,
  search,
  stateFilter,
  onCaseClick,
  onSearchChange,
  onStateFilterChange,
}: {
  cases: TestCase[];
  search: string;
  stateFilter: string;
  onCaseClick: (testCase: TestCase) => void;
  onSearchChange: (value: string) => void;
  onStateFilterChange: (value: string) => void;
}) {
  const getStateBadgeVariant = (state: string) => {
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
  };

  return (
    <div>
      {/* Search and Filter Bar */}
      <div className="p-4 border-b border-border flex gap-3 bg-muted/20">
        <div className="flex-1 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search test cases..."
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
        <select
          value={stateFilter}
          onChange={(e) => onStateFilterChange(e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
        >
          <option value="">All states</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="retired">Retired</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

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
        <div className="divide-y divide-border">
          {cases.map((testCase) => (
            <div
              key={testCase.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData(
                  "text/plain",
                  JSON.stringify({ type: "testcase", id: testCase.id, name: testCase.title })
                );
                // Set custom drag data for folder tree to read
                (window as unknown as { __draggedTestCase?: { id: number; name: string } }).__draggedTestCase = {
                  id: testCase.id,
                  name: testCase.title,
                };
              }}
              onDragEnd={() => {
                delete (window as unknown as { __draggedTestCase?: { id: number; name: string } }).__draggedTestCase;
              }}
              onClick={() => onCaseClick(testCase)}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group text-left cursor-grab active:cursor-grabbing"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <DragHandleIcon className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                    {testCase.title}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                    {testCase.folderName && (
                      <>
                        <FolderIcon className="w-3.5 h-3.5" />
                        <span>{testCase.folderName}</span>
                        <span className="text-border">·</span>
                      </>
                    )}
                    {testCase.updatedAt && (
                      <span>
                        Updated{" "}
                        {testCase.updatedAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <Badge variant={getStateBadgeVariant(testCase.state)}>
                  {testCase.state}
                </Badge>
                <ChevronRightIcon className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [gherkin, setGherkin] = useState("");
  const [folderId, setFolderId] = useState<string>(
    currentFolderId?.toString() || ""
  );
  const [state, setState] = useState<string>("active");
  const [error, setError] = useState<string | null>(null);

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
          gherkin,
          folderId: folderId ? Number(folderId) : null,
          state: state as "active" | "draft" | "retired" | "rejected",
        });

        if (result.error) {
          setError(result.error);
        } else {
          // Reset form and close
          setTitle("");
          setGherkin("");
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
    setGherkin("");
    setFolderId(currentFolderId?.toString() || "");
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
      <div className="p-6 space-y-4">
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
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            >
              <option value="">No folder</option>
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
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
            Gherkin Scenarios
          </label>
          <GherkinEditor value={gherkin} onChange={setGherkin} />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Creating..." : "Create Test Case"}
          </Button>
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
  const [gherkin, setGherkin] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [state, setState] = useState<string>("active");
  const [error, setError] = useState<string | null>(null);

  // Reset form when test case changes
  const resetForm = () => {
    if (testCase) {
      setTitle(testCase.title);
      setGherkin(testCase.gherkin || "");
      setFolderId(testCase.folderId?.toString() || "");
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
        const result = await saveTestCase({
          id: testCase.id,
          title: title.trim(),
          gherkin,
          folderId: folderId ? Number(folderId) : null,
          state: state as "active" | "draft" | "retired" | "rejected",
        });

        if (result.error) {
          setError(result.error);
        } else {
          setIsEditing(false);
          onSaved();
        }
      } catch {
        setError("Failed to save test case");
      }
    });
  };

  const handleDelete = () => {
    if (!testCase) return;
    if (!confirm("Are you sure you want to delete this test case?")) return;

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
                  <select
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                  >
                    <option value="">No folder</option>
                    {folders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
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
                  Gherkin Scenarios
                </label>
                <GherkinEditor value={gherkin} onChange={setGherkin} />
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
                  {testCase.folderName && (
                    <>
                      <FolderIcon className="w-4 h-4" />
                      <span>{testCase.folderName}</span>
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

              {/* Gherkin Scenarios */}
              <div>
                <h4 className="text-sm font-medium text-foreground mb-3">
                  Scenarios
                </h4>
                <GherkinDisplay text={testCase.gherkin || ""} />
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
