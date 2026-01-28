"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export interface Collaborator {
  id: string;
  name: string;
  avatar: string | null;
}

export interface TestRunData {
  id: number;
  name: string;
  releaseId: number | null;
  status: "in_progress" | "completed";
  environment: "sandbox" | "dev" | "staging" | "prod" | null;
  createdAt: Date | null;
  linearIssueIdentifier: string | null;
  linearProjectId: string | null;
  linearProjectName: string | null;
  linearMilestoneId: string | null;
  linearMilestoneName: string | null;
  stats: Record<string, number>;
  total: number;
  collaborators: Collaborator[];
}

interface TestRunRowProps {
  run: TestRunData;
  linearWorkspace?: string;
  showActions?: boolean;
  onDuplicate?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function TestRunRow({
  run,
  linearWorkspace,
  showActions = false,
  onDuplicate,
  onDelete,
  className,
}: TestRunRowProps) {
  const passRate = run.total > 0
    ? Math.round(((run.stats.passed || 0) / run.total) * 100)
    : 0;

  return (
    <Link
      href={`/runs/${run.id}`}
      className={cn(
        "flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group",
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
          {run.name}
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
          <span>
            {run.createdAt?.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="text-border">·</span>
          <span>{run.total} cases</span>
          {run.linearIssueIdentifier && linearWorkspace && (
            <>
              <span className="text-border">·</span>
              <a
                href={`https://linear.app/${linearWorkspace}/issue/${run.linearIssueIdentifier}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
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
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ProjectIcon className="w-3.5 h-3.5" />
                {run.linearProjectName}
              </a>
            </>
          )}
          {run.linearMilestoneName && run.linearProjectId && linearWorkspace && (
            <>
              <span className="text-border">·</span>
              <a
                href={`https://linear.app/${linearWorkspace}/project/${run.linearProjectId}#projectTab=milestones`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <MilestoneIcon className="w-3.5 h-3.5" />
                {run.linearMilestoneName}
              </a>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-5">
        {/* Progress Bar */}
        {run.total > 0 && (
          <div className="flex items-center gap-3">
            <div className="w-28 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500"
                style={{ width: `${passRate}%` }}
              />
            </div>
            <span className="text-sm font-medium text-muted-foreground w-10 tabular-nums">
              {passRate}%
            </span>
          </div>
        )}

        {/* Status Badges */}
        <div className="flex items-center gap-1.5">
          {run.stats.passed && (
            <Badge variant="success">{run.stats.passed}</Badge>
          )}
          {run.stats.failed && (
            <Badge variant="destructive">{run.stats.failed}</Badge>
          )}
          {run.stats.pending && (
            <Badge variant="secondary">{run.stats.pending}</Badge>
          )}
        </div>

        {/* Environment */}
        {run.environment && (
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
        )}

        {/* Run Status */}
        <Badge variant={run.status === "completed" ? "default" : "warning"}>
          {run.status === "in_progress" ? "In Progress" : "Completed"}
        </Badge>

        {/* Collaborator Avatars */}
        {run.collaborators.length > 0 && (
          <div className="flex items-center -space-x-1.5" title={run.collaborators.map(c => c.name).join(", ")}>
            {run.collaborators.slice(0, 3).map((collaborator) => (
              collaborator.avatar ? (
                <img
                  key={collaborator.id}
                  src={collaborator.avatar}
                  alt={collaborator.name}
                  title={collaborator.name}
                  className="w-5 h-5 rounded-full ring-2 ring-background"
                />
              ) : (
                <div
                  key={collaborator.id}
                  title={collaborator.name}
                  className="w-5 h-5 rounded-full bg-brand-500/10 flex items-center justify-center ring-2 ring-background"
                >
                  <span className="text-[8px] font-medium text-brand-600">
                    {collaborator.name?.[0]?.toUpperCase() || "?"}
                  </span>
                </div>
              )
            ))}
            {run.collaborators.length > 3 && (
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center ring-2 ring-background">
                <span className="text-[8px] font-medium text-muted-foreground">
                  +{run.collaborators.length - 3}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {showActions && onDuplicate && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors opacity-0 group-hover:opacity-100"
            title="Duplicate run"
          >
            <DuplicateIcon className="w-4 h-4" />
          </button>
        )}

        {showActions && onDelete && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-md transition-colors opacity-0 group-hover:opacity-100"
            title="Delete run"
          >
            <TrashIcon className="w-4 h-4" />
          </button>
        )}

        <ChevronRightIcon className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
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

function MilestoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function DuplicateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
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
