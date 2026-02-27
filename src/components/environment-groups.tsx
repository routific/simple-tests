"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { TestRunRow, type TestRunData } from "@/components/test-run-row";

// Environment grouping component
export function EnvironmentGroups({
  runs,
  linearWorkspace,
  onDuplicate,
  onDelete,
}: {
  runs: TestRunData[];
  linearWorkspace?: string;
  onDuplicate?: (run: TestRunData) => void;
  onDelete?: (run: TestRunData) => void;
}) {
  const [expandedEnvs, setExpandedEnvs] = useState<Set<string>>(() => {
    // Start with all environments expanded
    const envs = new Set(runs.map(r => r.environment || "unassigned"));
    return envs;
  });

  // Group runs by environment
  const envOrder: (typeof runs[0]["environment"] | "unassigned")[] = ["prod", "staging", "dev", "sandbox", "unassigned"];
  const runsByEnv = new Map<string, TestRunData[]>();

  for (const run of runs) {
    const env = run.environment || "unassigned";
    const existing = runsByEnv.get(env) || [];
    existing.push(run);
    runsByEnv.set(env, existing);
  }

  const toggleEnv = (env: string) => {
    setExpandedEnvs(prev => {
      const next = new Set(prev);
      if (next.has(env)) {
        next.delete(env);
      } else {
        next.add(env);
      }
      return next;
    });
  };

  const getEnvLabel = (env: string) => {
    switch (env) {
      case "prod": return "Production";
      case "staging": return "Staging";
      case "dev": return "Development";
      case "sandbox": return "Sandbox";
      default: return "Unassigned";
    }
  };

  const getEnvColor = (env: string) => {
    switch (env) {
      case "prod": return "bg-green-500";
      case "staging": return "bg-yellow-500";
      case "dev": return "bg-blue-500";
      case "sandbox": return "bg-gray-400";
      default: return "bg-gray-300";
    }
  };

  // Filter to only environments that have runs
  const activeEnvs = envOrder.filter(env => {
    const key = env === null ? "unassigned" : env;
    return runsByEnv.has(key) && (runsByEnv.get(key)?.length || 0) > 0;
  });

  // If only one environment (or no environment grouping needed), render runs directly
  if (activeEnvs.length <= 1) {
    return (
      <div className="divide-y divide-border">
        {runs.map(run => (
          <TestRunRow
            key={run.id}
            run={run}
            linearWorkspace={linearWorkspace}
            showActions={!!(onDuplicate || onDelete)}
            onDuplicate={onDuplicate ? () => onDuplicate(run) : undefined}
            onDelete={onDelete ? () => onDelete(run) : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      {activeEnvs.map(env => {
        const key = env === null ? "unassigned" : env;
        const envRuns = runsByEnv.get(key) || [];
        const isExpanded = expandedEnvs.has(key);

        return (
          <div key={key} className="border-b border-border last:border-b-0">
            {/* Environment Header */}
            <button
              onClick={() => toggleEnv(key)}
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2 text-left transition-colors",
                "bg-muted/30 hover:bg-muted/50"
              )}
            >
              <ChevronIcon
                className={cn(
                  "w-3 h-3 text-muted-foreground transition-transform",
                  isExpanded && "rotate-90"
                )}
              />
              <span className={cn("w-2 h-2 rounded-full", getEnvColor(key))} />
              <span className="text-sm font-medium text-foreground">
                {getEnvLabel(key)}
              </span>
              <Badge variant="secondary" className="text-xs font-normal">
                {envRuns.length}
              </Badge>
            </button>

            {/* Environment Runs */}
            {isExpanded && (
              <div className="divide-y divide-border">
                {envRuns.map(run => (
                  <TestRunRow
                    key={run.id}
                    run={run}
                    linearWorkspace={linearWorkspace}
                    showActions={!!(onDuplicate || onDelete)}
                    onDuplicate={onDuplicate ? () => onDuplicate(run) : undefined}
                    onDelete={onDelete ? () => onDelete(run) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
