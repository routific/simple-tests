"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { undoOperation, getLogsWithUsers } from "./actions";
import type { McpWriteLog } from "@/lib/db/schema";

interface LogWithUser extends McpWriteLog {
  userName: string;
  userEmail: string;
}

interface McpWriteLogsProps {
  initialLogs: LogWithUser[];
  total: number;
}

export function McpWriteLogs({ initialLogs, total }: McpWriteLogsProps) {
  const [logs, setLogs] = useState(initialLogs);
  const [loading, setLoading] = useState<number | null>(null);
  const [showUndone, setShowUndone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleUndo = async (logId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading(logId);
    setError(null);

    const result = await undoOperation(logId);

    if ("error" in result) {
      setError(result.error || "Failed to undo");
    } else {
      // Refresh the list
      const refreshed = await getLogsWithUsers({ showUndone });
      if (!("error" in refreshed)) {
        setLogs(refreshed.logs);
      }
    }

    setLoading(null);
  };

  const toggleShowUndone = async () => {
    const newShowUndone = !showUndone;
    setShowUndone(newShowUndone);

    const result = await getLogsWithUsers({ showUndone: newShowUndone });
    if (!("error" in result)) {
      setLogs(result.logs);
    }
  };

  const toggleExpanded = (logId: number) => {
    setExpandedId(expandedId === logId ? null : logId);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleString();
  };

  const getToolBadgeColor = (toolName: string) => {
    if (toolName.startsWith("create_")) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (toolName.startsWith("update_")) return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    if (toolName.startsWith("delete_")) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  };

  const getStatusBadge = (status: string, undoneAt: Date | null) => {
    if (undoneAt) {
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    }
    if (status === "success") {
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    }
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  };

  const canUndo = (log: LogWithUser) => {
    return (
      log.status === "success" &&
      !log.undoneAt &&
      (log.toolName.startsWith("create_") || log.toolName.startsWith("update_"))
    );
  };

  const parseJson = (json: string | null): Record<string, unknown> | null => {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const renderJsonValue = (value: unknown, indent = 0): React.ReactNode => {
    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">null</span>;
    }
    if (typeof value === "string") {
      // Truncate long strings
      const display = value.length > 100 ? value.slice(0, 100) + "..." : value;
      return <span className="text-green-600 dark:text-green-400">"{display}"</span>;
    }
    if (typeof value === "number") {
      return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
    }
    if (typeof value === "boolean") {
      return <span className="text-purple-600 dark:text-purple-400">{value.toString()}</span>;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-muted-foreground">[]</span>;
      return (
        <span>
          [
          {value.map((item, i) => (
            <span key={i}>
              {i > 0 && ", "}
              {renderJsonValue(item, indent)}
            </span>
          ))}
          ]
        </span>
      );
    }
    if (typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length === 0) return <span className="text-muted-foreground">{"{}"}</span>;
      return (
        <span>
          {"{"}
          {entries.map(([k, v], i) => (
            <span key={k}>
              {i > 0 && ", "}
              <span className="text-foreground">{k}</span>: {renderJsonValue(v, indent)}
            </span>
          ))}
          {"}"}
        </span>
      );
    }
    return String(value);
  };

  const getChangedFields = (before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] => {
    if (!before || !after) return [];
    const changed: string[] = [];
    const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    for (const key of allKeys) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changed.push(key);
      }
    }
    return changed;
  };

  if (logs.length === 0 && !showUndone) {
    return (
      <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-lg">
        No MCP write operations yet. Operations will appear here when you use MCP tools.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {logs.length} of {total} operations
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={showUndone}
            onChange={toggleShowUndone}
            className="rounded border-gray-300"
          />
          Show undone
        </label>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Logs List */}
      <div className="space-y-2">
        {logs.map((log) => {
          const isExpanded = expandedId === log.id;
          const toolArgs = parseJson(log.toolArgs);
          const beforeState = parseJson(log.beforeState);
          const afterState = parseJson(log.afterState);
          const changedFields = getChangedFields(beforeState, afterState);

          return (
            <div
              key={log.id}
              className={cn(
                "border border-border rounded-lg transition-all",
                log.undoneAt && "opacity-60",
                isExpanded && "ring-1 ring-brand-500/50"
              )}
            >
              {/* Header Row - Clickable */}
              <div
                onClick={() => toggleExpanded(log.id)}
                className={cn(
                  "p-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/50 transition-colors",
                  isExpanded && "border-b border-border"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-xs font-medium px-2 py-0.5 rounded", getToolBadgeColor(log.toolName))}>
                      {log.toolName}
                    </span>
                    <span className="text-sm text-foreground">
                      {log.entityType}
                      {log.entityId && <span className="text-muted-foreground">#{log.entityId}</span>}
                    </span>
                    <span className={cn("text-xs px-1.5 py-0.5 rounded", getStatusBadge(log.status, log.undoneAt))}>
                      {log.undoneAt ? "undone" : log.status}
                    </span>
                    {changedFields.length > 0 && log.toolName.startsWith("update_") && (
                      <span className="text-xs text-muted-foreground">
                        ({changedFields.length} field{changedFields.length !== 1 ? "s" : ""} changed)
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {log.userName} · {formatDate(log.createdAt)}
                  </div>
                  {log.errorMessage && (
                    <div className="text-xs text-red-500 mt-1 truncate" title={log.errorMessage}>
                      {log.errorMessage}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canUndo(log) && (
                    <button
                      onClick={(e) => handleUndo(log.id, e)}
                      disabled={loading === log.id}
                      className={cn(
                        "text-xs font-medium px-3 py-1.5 rounded-md transition-colors shrink-0",
                        "bg-amber-100 text-amber-700 hover:bg-amber-200",
                        "dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50",
                        loading === log.id && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {loading === log.id ? "..." : "Undo"}
                    </button>
                  )}
                  <ChevronIcon
                    className={cn(
                      "w-4 h-4 text-muted-foreground transition-transform",
                      isExpanded && "rotate-180"
                    )}
                  />
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="p-4 space-y-4 bg-muted/30 text-sm">
                  {/* Tool Arguments */}
                  {toolArgs && Object.keys(toolArgs).length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Arguments
                      </div>
                      <div className="bg-background rounded border border-border p-3 font-mono text-xs overflow-x-auto">
                        <table className="w-full">
                          <tbody>
                            {Object.entries(toolArgs).map(([key, value]) => (
                              <tr key={key} className="border-b border-border/50 last:border-0">
                                <td className="py-1 pr-4 text-muted-foreground align-top whitespace-nowrap">{key}</td>
                                <td className="py-1 break-all">{renderJsonValue(value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Before/After State for Updates */}
                  {log.toolName.startsWith("update_") && (beforeState || afterState) && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Changes
                      </div>
                      <div className="bg-background rounded border border-border overflow-hidden">
                        <table className="w-full text-xs font-mono">
                          <thead>
                            <tr className="border-b border-border bg-muted/50">
                              <th className="py-2 px-3 text-left font-medium text-muted-foreground">Field</th>
                              <th className="py-2 px-3 text-left font-medium text-red-600 dark:text-red-400">Before</th>
                              <th className="py-2 px-3 text-left font-medium text-green-600 dark:text-green-400">After</th>
                            </tr>
                          </thead>
                          <tbody>
                            {changedFields.map((field) => (
                              <tr key={field} className="border-b border-border/50 last:border-0">
                                <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{field}</td>
                                <td className="py-2 px-3 bg-red-50/50 dark:bg-red-900/10 break-all">
                                  {renderJsonValue(beforeState?.[field])}
                                </td>
                                <td className="py-2 px-3 bg-green-50/50 dark:bg-green-900/10 break-all">
                                  {renderJsonValue(afterState?.[field])}
                                </td>
                              </tr>
                            ))}
                            {changedFields.length === 0 && (
                              <tr>
                                <td colSpan={3} className="py-2 px-3 text-center text-muted-foreground italic">
                                  No changes detected
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Created Entity State */}
                  {log.toolName.startsWith("create_") && afterState && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Created Entity
                      </div>
                      <div className="bg-background rounded border border-border p-3 font-mono text-xs overflow-x-auto">
                        <table className="w-full">
                          <tbody>
                            {Object.entries(afterState).map(([key, value]) => (
                              <tr key={key} className="border-b border-border/50 last:border-0">
                                <td className="py-1 pr-4 text-muted-foreground align-top whitespace-nowrap">{key}</td>
                                <td className="py-1 break-all">{renderJsonValue(value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Deleted Entity State */}
                  {log.toolName.startsWith("delete_") && beforeState && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                        Deleted Entity
                      </div>
                      <div className="bg-background rounded border border-border p-3 font-mono text-xs overflow-x-auto bg-red-50/30 dark:bg-red-900/10">
                        <table className="w-full">
                          <tbody>
                            {Object.entries(beforeState).map(([key, value]) => (
                              <tr key={key} className="border-b border-border/50 last:border-0">
                                <td className="py-1 pr-4 text-muted-foreground align-top whitespace-nowrap">{key}</td>
                                <td className="py-1 break-all">{renderJsonValue(value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Session Info */}
                  <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
                    <span>Client: <code className="bg-muted px-1 rounded">{log.clientId}</code></span>
                    {log.sessionId && (
                      <span>Session: <code className="bg-muted px-1 rounded">{log.sessionId.slice(0, 8)}...</code></span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
