"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { cn } from "@/lib/utils";
import { createRelease } from "@/app/releases/actions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface Release {
  id: number;
  name: string;
  status: "active" | "completed";
}

interface ReleasePickerProps {
  releases: Release[];
  value: number | null;
  onChange: (releaseId: number | null) => void;
  onReleaseCreated?: (release: Release) => void;
  placeholder?: string;
  className?: string;
}

export function ReleasePicker({
  releases,
  value,
  onChange,
  onReleaseCreated,
  placeholder = "No release",
  className,
}: ReleasePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newReleaseName, setNewReleaseName] = useState("");
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (releaseId: number | null) => {
    onChange(releaseId);
    setIsOpen(false);
  };

  const handleCreateRelease = () => {
    if (!newReleaseName.trim()) return;

    startTransition(async () => {
      const result = await createRelease({ name: newReleaseName.trim() });
      if (result.success && result.release) {
        const newRelease = {
          id: result.release.id,
          name: result.release.name,
          status: result.release.status as "active" | "completed",
        };
        onReleaseCreated?.(newRelease);
        onChange(newRelease.id);
        setNewReleaseName("");
        setIsOpen(false);
      }
    });
  };

  const selectedRelease = releases.find((r) => r.id === value);

  // Sort releases: active first, then by name
  const sortedReleases = [...releases].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "active" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={cn(
          "w-full px-3 py-2 border border-input rounded-lg bg-background text-left text-sm",
          "focus:outline-none focus:ring-2 focus:ring-primary/20",
          "flex items-center justify-between gap-2"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ReleaseIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className={cn("truncate", !selectedRelease && "text-muted-foreground")}>
            {selectedRelease?.name || placeholder}
          </span>
          {selectedRelease && (
            <Badge
              variant={selectedRelease.status === "active" ? "success" : "secondary"}
              className="flex-shrink-0"
            >
              {selectedRelease.status}
            </Badge>
          )}
        </div>
        <ChevronDownIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 min-w-[280px] w-full bg-background border border-border rounded-lg shadow-lg max-h-80 overflow-auto">
          {/* No release option */}
          <div
            className={cn(
              "flex items-center gap-2 py-2 px-3 cursor-pointer transition-colors",
              value === null
                ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
                : "hover:bg-muted text-muted-foreground"
            )}
            onClick={() => handleSelect(null)}
          >
            <span className="text-sm">No release</span>
          </div>

          {sortedReleases.length > 0 && (
            <>
              <div className="border-t border-border my-1" />
              <div className="py-1">
                {sortedReleases.map((release) => (
                  <div
                    key={release.id}
                    className={cn(
                      "flex items-center justify-between gap-2 py-2 px-3 cursor-pointer transition-colors",
                      value === release.id
                        ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
                        : "hover:bg-muted text-foreground"
                    )}
                    onClick={() => handleSelect(release.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ReleaseIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="truncate text-sm">{release.name}</span>
                    </div>
                    <Badge
                      variant={release.status === "active" ? "success" : "secondary"}
                      className="flex-shrink-0"
                    >
                      {release.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Create new release */}
          <div className="border-t border-border p-2">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                type="text"
                value={newReleaseName}
                onChange={(e) => setNewReleaseName(e.target.value)}
                placeholder="New release name..."
                className="flex-1 h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateRelease();
                  }
                }}
              />
              <Button
                size="sm"
                onClick={handleCreateRelease}
                disabled={!newReleaseName.trim() || isPending}
                className="h-8"
              >
                {isPending ? (
                  <LoadingIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <PlusIcon className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReleaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
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

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
