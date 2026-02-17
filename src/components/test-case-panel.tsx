"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { SlidePanel } from "@/components/ui/slide-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScenarioAccordion } from "@/components/scenario-accordion";
import {
  saveTestCase,
  deleteTestCase,
  getTestCaseAuditLog,
  getLinkedIssues,
} from "@/app/cases/actions";
import { getScenarios } from "@/app/cases/scenario-actions";
import { cn } from "@/lib/utils";
import { buildFolderBreadcrumb, formatBreadcrumb } from "@/lib/folders";
import { FolderPicker } from "@/components/folder-picker";
import { LinearIssuePicker, LinkedIssuesList } from "@/components/linear-issue-picker";

export interface LinkedIssue {
  id: string;
  identifier: string;
  title: string;
}

export interface Scenario {
  id: number;
  title: string;
  gherkin: string;
  order: number;
}

export interface TestCasePanelTestCase {
  id: number;
  title: string;
  state: string;
  folderId?: number | null;
  updatedAt?: Date | null;
}

export interface Folder {
  id: number;
  name: string;
  parentId: number | null;
}

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

// Helper to parse changes JSON
function parseChanges(changesJson: string): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  try {
    return JSON.parse(changesJson) || [];
  } catch {
    return [];
  }
}

// Helper to format field names for display
function formatFieldName(field: string): string {
  const fieldMap: Record<string, string> = {
    title: "Title",
    state: "State",
    folderId: "Folder",
    "scenario.title": "Scenario Title",
    "scenario.gherkin": "Scenario Steps",
    "scenario.added": "Scenario Added",
    "scenario.removed": "Scenario Removed",
  };
  return fieldMap[field] || field;
}

// Helper to format values for diff display
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// Helper to format audit log actions
function formatAuditAction(action: string, changesJson: string): string {
  try {
    const changes = JSON.parse(changesJson) as Array<{ field: string; oldValue: unknown; newValue: unknown }>;

    if (action === "created") {
      return "created this test case";
    }

    if (action === "deleted") {
      return "deleted this test case";
    }

    if (changes.length === 0) {
      return "made changes";
    }

    const descriptions = changes.map((change) => {
      if (change.field === "scenario.added") {
        return `added scenario "${change.newValue}"`;
      }
      if (change.field === "scenario.removed") {
        return `removed scenario "${change.oldValue}"`;
      }
      if (change.field === "scenario.title") {
        return `renamed scenario to "${change.newValue}"`;
      }
      if (change.field === "scenario.gherkin") {
        return "updated scenario steps";
      }
      if (change.field === "title") {
        return `renamed to "${change.newValue}"`;
      }
      if (change.field === "state") {
        return `changed state to ${change.newValue}`;
      }
      if (change.field === "folderId") {
        return change.newValue ? "moved to a folder" : "removed from folder";
      }
      return `updated ${change.field}`;
    });

    return descriptions.join(", ");
  } catch {
    return "made changes";
  }
}

interface TestCasePanelProps {
  isOpen: boolean;
  onClose: () => void;
  testCase: TestCasePanelTestCase | null;
  folders: Folder[];
  onSaved: () => void;
  onDeleted: () => void;
  linearWorkspace?: string;
  /** If true, the panel won't allow deletion */
  hideDelete?: boolean;
}

export function TestCasePanel({
  isOpen,
  onClose,
  testCase,
  folders,
  onSaved,
  onDeleted,
  linearWorkspace,
  hideDelete = false,
}: TestCasePanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [state, setState] = useState<string>("active");
  const [linkedIssues, setLinkedIssues] = useState<LinkedIssue[]>([]);
  const [loadingLinkedIssues, setLoadingLinkedIssues] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [auditLog, setAuditLog] = useState<Array<{
    id: number;
    action: string;
    changes: string;
    previousValues: string | null;
    newValues: string | null;
    createdAt: Date;
    userName: string | null;
    userAvatar: string | null;
  }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<number | null>(null);

  const refreshAuditLog = async () => {
    if (testCase) {
      const logs = await getTestCaseAuditLog(testCase.id);
      setAuditLog(logs);
    }
  };

  // Fetch scenarios and linked issues when panel opens or after save
  useEffect(() => {
    if (testCase && isOpen) {
      setLoadingScenarios(true);
      getScenarios(testCase.id)
        .then((data) => {
          setScenarios(data);
        })
        .finally(() => setLoadingScenarios(false));

      // Fetch linked issues
      setLoadingLinkedIssues(true);
      getLinkedIssues(testCase.id)
        .then((data) => {
          setLinkedIssues(data);
        })
        .finally(() => setLoadingLinkedIssues(false));

      // Fetch audit log
      getTestCaseAuditLog(testCase.id).then(setAuditLog);
    }
  }, [testCase?.id, isOpen, refreshCounter]);

  // Reset form when test case changes
  const resetForm = () => {
    if (testCase) {
      setTitle(testCase.title);
      setFolderId(testCase.folderId ?? null);
      setState(testCase.state);
      // Keep linkedIssues as-is since they were fetched
    }
    setIsEditing(false);
    setError(null);
  };

  // Sync form fields when testCase prop changes (after router.refresh)
  const lastTestCaseIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (testCase && !isEditing) {
      // If switching to a different test case, reset the form
      if (lastTestCaseIdRef.current !== testCase.id) {
        resetForm();
        lastTestCaseIdRef.current = testCase.id;
      }
    }
  }, [testCase?.id, testCase?.title, testCase?.state, testCase?.folderId, isEditing]);

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
          linkedIssues,
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
        setRefreshCounter(c => c + 1); // Trigger re-fetch of scenarios and linked issues
        onSaved();
        refreshAuditLog();
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
      case "upcoming":
        return "info";
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
                    <option value="upcoming">Upcoming</option>
                    <option value="retired">Retired</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Linked Issues <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                {loadingLinkedIssues ? (
                  <div className="text-sm text-muted-foreground">Loading linked issues...</div>
                ) : (
                  <LinearIssuePicker
                    multiple
                    values={linkedIssues}
                    onMultiChange={setLinkedIssues}
                    placeholder="Search Linear issues..."
                    workspace={linearWorkspace}
                  />
                )}
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
                {!hideDelete ? (
                  <Button
                    variant="ghost"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    Delete
                  </Button>
                ) : (
                  <div />
                )}
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
                      {new Date(testCase.updatedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </div>

              {/* Linked Issues */}
              {(linkedIssues.length > 0 || loadingLinkedIssues) && (
                <div>
                  <h4 className="text-sm font-medium text-foreground mb-3">
                    Linked Issues
                  </h4>
                  {loadingLinkedIssues ? (
                    <div className="text-sm text-muted-foreground">Loading linked issues...</div>
                  ) : (
                    <LinkedIssuesList issues={linkedIssues} workspace={linearWorkspace} />
                  )}
                </div>
              )}

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

              {/* History */}
              {auditLog.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-brand-600 transition-colors"
                  >
                    <HistoryIcon className="w-4 h-4" />
                    History ({auditLog.length})
                    <ChevronDownIcon className={cn("w-3 h-3 transition-transform", showHistory && "rotate-180")} />
                  </button>
                  {showHistory && (
                    <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                      {auditLog.slice().reverse().map((entry) => {
                        const isExpanded = expandedEntryId === entry.id;
                        const changes = parseChanges(entry.changes);
                        const hasDiff = changes.length > 0 || entry.previousValues || entry.newValues;

                        return (
                          <div key={entry.id} className="border border-border rounded-lg overflow-hidden">
                            <button
                              onClick={() => hasDiff && setExpandedEntryId(isExpanded ? null : entry.id)}
                              className={cn(
                                "w-full flex gap-3 p-3 text-sm text-left",
                                hasDiff && "hover:bg-muted/50 cursor-pointer",
                                !hasDiff && "cursor-default"
                              )}
                            >
                              {entry.userAvatar ? (
                                <img
                                  src={entry.userAvatar}
                                  alt=""
                                  className="w-6 h-6 rounded-full flex-shrink-0"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                  <span className="text-xs text-muted-foreground">
                                    {entry.userName?.charAt(0) || "?"}
                                  </span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-foreground">
                                  <span className="font-medium">{entry.userName || "Unknown"}</span>
                                  {" "}
                                  <span className="text-muted-foreground">
                                    {formatAuditAction(entry.action, entry.changes)}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatTimeAgo(entry.createdAt)}
                                </div>
                              </div>
                              {hasDiff && (
                                <ChevronDownIcon className={cn("w-4 h-4 text-muted-foreground transition-transform flex-shrink-0", isExpanded && "rotate-180")} />
                              )}
                            </button>
                            {isExpanded && hasDiff && (
                              <div className="px-3 pb-3 pt-0 border-t border-border bg-muted/30">
                                <div className="mt-2 space-y-2 text-xs font-mono">
                                  {changes.map((change, i) => (
                                    <div key={i} className="space-y-1">
                                      <div className="text-muted-foreground font-sans font-medium">
                                        {formatFieldName(change.field)}
                                      </div>
                                      {change.oldValue !== null && change.oldValue !== undefined && (
                                        <div className="bg-red-500/10 text-red-700 dark:text-red-400 px-2 py-1 rounded whitespace-pre-wrap break-all">
                                          - {formatValue(change.oldValue)}
                                        </div>
                                      )}
                                      {change.newValue !== null && change.newValue !== undefined && (
                                        <div className="bg-green-500/10 text-green-700 dark:text-green-400 px-2 py-1 rounded whitespace-pre-wrap break-all">
                                          + {formatValue(change.newValue)}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

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

function HistoryIcon({ className }: { className?: string }) {
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
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
