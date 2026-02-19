"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

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

// Icons
function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
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

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function getProjectStateColor(state: string) {
  switch (state) {
    case "started": return "#10b981"; // green
    case "planned": return "#3b82f6"; // blue
    case "backlog": return "#6b7280"; // gray
    case "paused": return "#f59e0b"; // amber
    case "completed": return "#8b5cf6"; // purple
    case "canceled": return "#ef4444"; // red
    default: return "#6b7280";
  }
}

// Linear Project Picker with search
export function LinearProjectPicker({
  projects,
  value,
  onChange,
  loading,
}: {
  projects: LinearProject[];
  value: LinearProject | null;
  onChange: (project: LinearProject | null) => void;
  loading: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Filter projects by search
  const filteredProjects = search
    ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects;

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm text-muted-foreground mb-1.5">
        Project
      </label>
      <button
        type="button"
        onClick={() => !loading && setIsOpen(!isOpen)}
        disabled={loading}
        className={cn(
          "w-full px-3 py-2 text-sm border border-input rounded-lg bg-background text-left",
          "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "flex items-center justify-between gap-2"
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {value ? (
            <>
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: getProjectStateColor(value.state) }}
              />
              <span className="truncate text-foreground">{value.name}</span>
            </>
          ) : (
            <>
              <ProjectIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Select project...</span>
            </>
          )}
        </div>
        {loading ? (
          <LoadingIcon className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
        ) : (
          <ChevronDownIcon className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", isOpen && "rotate-180")} />
        )}
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full bg-background border border-border rounded-lg shadow-lg">
          {/* Search input */}
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full px-2 py-1.5 text-sm bg-muted/50 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
          </div>
          <div className="max-h-48 overflow-auto">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setIsOpen(false);
                setSearch("");
              }}
              className={cn(
                "w-full px-3 py-2 text-left hover:bg-muted transition-colors flex items-center gap-2",
                !value && "bg-muted/50"
              )}
            >
              <span className="text-sm text-muted-foreground">None</span>
            </button>
            {filteredProjects.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No projects found
              </div>
            ) : (
              filteredProjects.map((project) => (
                <button
                  type="button"
                  key={project.id}
                  onClick={() => {
                    onChange(project);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-left hover:bg-muted transition-colors flex items-center gap-2",
                    value?.id === project.id && "bg-muted/50"
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: getProjectStateColor(project.state) }}
                  />
                  <span className="text-sm text-foreground truncate">{project.name}</span>
                  <span className="text-xs text-muted-foreground capitalize ml-auto shrink-0">
                    {project.state}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Linear Milestone Picker
export function LinearMilestonePicker({
  milestones,
  value,
  onChange,
  disabled,
  loading,
}: {
  milestones: LinearMilestone[];
  value: LinearMilestone | null;
  onChange: (milestone: LinearMilestone | null) => void;
  disabled: boolean;
  loading: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm text-muted-foreground mb-1.5">
        Milestone
      </label>
      <button
        type="button"
        onClick={() => !disabled && !loading && setIsOpen(!isOpen)}
        disabled={disabled || loading}
        className={cn(
          "w-full px-3 py-2 text-sm border border-input rounded-lg bg-background text-left",
          "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "flex items-center justify-between gap-2"
        )}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {value ? (
            <>
              <MilestoneIcon className="w-4 h-4 text-brand-500 shrink-0" />
              <span className="truncate text-foreground">{value.name}</span>
              {value.targetDate && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatDate(value.targetDate)}
                </span>
              )}
            </>
          ) : (
            <>
              <MilestoneIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">
                {disabled ? "Select a project first" : "Select milestone..."}
              </span>
            </>
          )}
        </div>
        {loading ? (
          <LoadingIcon className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
        ) : (
          <ChevronDownIcon className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", isOpen && "rotate-180")} />
        )}
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setIsOpen(false);
            }}
            className={cn(
              "w-full px-3 py-2 text-left hover:bg-muted transition-colors flex items-center gap-2",
              !value && "bg-muted/50"
            )}
          >
            <span className="text-sm text-muted-foreground">None</span>
          </button>
          {milestones.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No milestones found
            </div>
          ) : (
            milestones.map((milestone) => (
              <button
                type="button"
                key={milestone.id}
                onClick={() => {
                  onChange(milestone);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-2 text-left hover:bg-muted transition-colors flex items-center gap-2",
                  value?.id === milestone.id && "bg-muted/50"
                )}
              >
                <MilestoneIcon className="w-4 h-4 text-brand-500 shrink-0" />
                <span className="text-sm text-foreground truncate">{milestone.name}</span>
                {milestone.targetDate && (
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {formatDate(milestone.targetDate)}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Linear Issue Picker
export function LinearIssuePicker({
  issues,
  value,
  onChange,
  searchValue,
  onSearchChange,
  loading,
}: {
  issues: LinearIssue[];
  value: LinearIssue | null;
  onChange: (issue: LinearIssue | null) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  loading: boolean;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm text-muted-foreground mb-1.5">
        Link to Issue
      </label>
      <div className="relative">
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className={cn(
              "w-full px-3 py-2 text-sm border border-input rounded-lg bg-background text-left",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors",
              "flex items-center gap-2"
            )}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: value.state.color }}
            />
            <span className="font-medium text-foreground">{value.identifier}</span>
            <span className="text-muted-foreground truncate flex-1">{value.title}</span>
            <CloseIcon className="w-4 h-4 text-muted-foreground hover:text-foreground shrink-0" />
          </button>
        ) : (
          <div className="relative">
            <Input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              placeholder="Search issues..."
              className="pr-8"
            />
            {loading && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <LoadingIcon className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Issue dropdown */}
      {!value && isFocused && searchValue && issues.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-auto">
          {issues.map((issue) => (
            <button
              type="button"
              key={issue.id}
              onClick={() => {
                onChange(issue);
                onSearchChange("");
                setIsFocused(false);
              }}
              className="w-full px-3 py-2 text-left hover:bg-muted transition-colors flex items-center gap-2"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: issue.state.color }}
              />
              <span className="font-medium text-sm text-foreground">{issue.identifier}</span>
              <span className="text-sm text-muted-foreground truncate">
                {issue.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
