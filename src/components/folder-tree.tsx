"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { FolderWithChildren } from "@/lib/folders";

interface FolderTreeProps {
  folders: FolderWithChildren[];
  selectedFolderId?: number | null;
  caseCounts: Record<number, number>;
}

// Get all ancestor IDs for a folder
function getAncestorPath(
  folders: FolderWithChildren[],
  targetId: number | null,
  path: Set<number> = new Set()
): Set<number> {
  if (!targetId) return path;

  for (const folder of folders) {
    if (folder.id === targetId) {
      path.add(folder.id);
      return path;
    }
    if (folder.children.length > 0) {
      const found = getAncestorPath(folder.children, targetId, path);
      if (found.has(targetId)) {
        path.add(folder.id);
        return path;
      }
    }
  }
  return path;
}

// Get all folder IDs recursively
function getAllFolderIds(folders: FolderWithChildren[]): Set<number> {
  const ids = new Set<number>();
  function collect(folderList: FolderWithChildren[]) {
    for (const folder of folderList) {
      ids.add(folder.id);
      if (folder.children.length > 0) {
        collect(folder.children);
      }
    }
  }
  collect(folders);
  return ids;
}

export function FolderTree({
  folders,
  selectedFolderId,
  caseCounts,
}: FolderTreeProps) {
  // Calculate which folders should be expanded (ancestors of selected)
  const expandedByDefault = useMemo(() => {
    if (!selectedFolderId) return new Set<number>();
    return getAncestorPath(folders, selectedFolderId);
  }, [folders, selectedFolderId]);

  // Track expanded state globally
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(() => {
    // Start with root folders expanded + ancestors of selected
    const initial = new Set<number>();
    folders.forEach((f) => initial.add(f.id));
    expandedByDefault.forEach((id) => initial.add(id));
    return initial;
  });

  const allFolderIds = useMemo(() => getAllFolderIds(folders), [folders]);

  const handleExpandAll = useCallback(() => {
    setExpandedFolders(new Set(allFolderIds));
  }, [allFolderIds]);

  const handleCollapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  const toggleFolder = useCallback((folderId: number) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const totalCount = Object.values(caseCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="py-2 text-sm">
      {/* Expand/Collapse buttons */}
      <div className="flex items-center gap-1 px-3 mb-2">
        <button
          onClick={handleExpandAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
        >
          Expand all
        </button>
        <span className="text-muted-foreground/50">|</span>
        <button
          onClick={handleCollapseAll}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
        >
          Collapse all
        </button>
      </div>

      <Link
        href="/cases"
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg mx-2 transition-colors",
          selectedFolderId === null
            ? "bg-brand-500/10 text-brand-600 dark:text-brand-400 font-medium"
            : "hover:bg-muted text-muted-foreground hover:text-foreground"
        )}
      >
        <FolderIcon className="w-4 h-4 text-amber-500" />
        <span className="flex-1">All Cases</span>
        <span className="text-xs text-muted-foreground tabular-nums">{totalCount}</span>
      </Link>

      <div className="mt-1">
        {folders.map((folder, index) => (
          <FolderItem
            key={folder.id}
            folder={folder}
            selectedFolderId={selectedFolderId}
            caseCounts={caseCounts}
            level={0}
            expandedFolders={expandedFolders}
            toggleFolder={toggleFolder}
            isLast={index === folders.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function FolderItem({
  folder,
  selectedFolderId,
  caseCounts,
  level,
  expandedFolders,
  toggleFolder,
  isLast,
}: {
  folder: FolderWithChildren;
  selectedFolderId?: number | null;
  caseCounts: Record<number, number>;
  level: number;
  expandedFolders: Set<number>;
  toggleFolder: (id: number) => void;
  isLast: boolean;
}) {
  const isOpen = expandedFolders.has(folder.id);
  const hasChildren = folder.children.length > 0;
  const isSelected = selectedFolderId === folder.id;

  // Calculate total count including all descendants
  const getTotalCount = (f: FolderWithChildren): number => {
    let total = caseCounts[f.id] || 0;
    for (const child of f.children) {
      total += getTotalCount(child);
    }
    return total;
  };
  const totalCount = getTotalCount(folder);

  return (
    <div className="relative">
      {/* Vertical line for tree structure */}
      {level > 0 && (
        <div
          className="absolute left-0 top-0 w-px bg-border"
          style={{
            left: `${12 + (level - 1) * 20}px`,
            height: isLast ? "16px" : "100%",
          }}
        />
      )}

      {/* Horizontal line for tree structure */}
      {level > 0 && (
        <div
          className="absolute top-4 h-px bg-border"
          style={{
            left: `${12 + (level - 1) * 20}px`,
            width: "12px",
          }}
        />
      )}

      <div
        className={cn(
          "flex items-center gap-1.5 py-1.5 rounded-lg mx-2 relative transition-colors",
          isSelected
            ? "bg-brand-500/10 text-brand-600 dark:text-brand-400 font-medium"
            : "hover:bg-muted text-muted-foreground hover:text-foreground"
        )}
        style={{ paddingLeft: `${8 + level * 20}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => toggleFolder(folder.id)}
            className="p-1 hover:bg-muted-foreground/10 rounded transition-colors flex-shrink-0"
          >
            <ChevronIcon
              className={cn(
                "w-3 h-3 text-muted-foreground transition-transform duration-200",
                isOpen && "rotate-90"
              )}
            />
          </button>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}

        <FolderIcon
          className={cn(
            "w-4 h-4 flex-shrink-0 transition-colors",
            isSelected ? "text-amber-500" : "text-amber-400"
          )}
        />

        <Link
          href={`/cases?folder=${folder.id}`}
          className="flex-1 truncate px-1"
        >
          {folder.name}
        </Link>

        {totalCount > 0 && (
          <span className="text-xs text-muted-foreground pr-2 tabular-nums">
            {totalCount}
          </span>
        )}
      </div>

      {hasChildren && isOpen && (
        <div className="animate-fade-in">
          {folder.children.map((child, index) => (
            <FolderItem
              key={child.id}
              folder={child}
              selectedFolderId={selectedFolderId}
              caseCounts={caseCounts}
              level={level + 1}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              isLast={index === folder.children.length - 1}
            />
          ))}
        </div>
      )}
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
