"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { buildFolderBreadcrumb, formatBreadcrumb } from "@/lib/folders";

interface Folder {
  id: number;
  name: string;
  parentId: number | null;
}

interface FolderNode {
  id: number;
  name: string;
  parentId: number | null;
  children: FolderNode[];
}

interface FolderPickerProps {
  folders: Folder[];
  value: number | null;
  onChange: (folderId: number | null) => void;
  placeholder?: string;
  className?: string;
  /** "default" for form fields, "inline" for compact list row usage */
  variant?: "default" | "inline";
}

function buildTree(folders: Folder[]): FolderNode[] {
  const map = new Map<number, FolderNode>();
  const roots: FolderNode[] = [];

  // Create nodes
  folders.forEach((f) => {
    map.set(f.id, { ...f, children: [] });
  });

  // Build tree
  folders.forEach((f) => {
    const node = map.get(f.id)!;
    if (f.parentId === null) {
      roots.push(node);
    } else {
      const parent = map.get(f.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  });

  // Sort by name
  const sortNodes = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);

  return roots;
}

export function FolderPicker({
  folders,
  value,
  onChange,
  placeholder = "Select folder...",
  className,
  variant = "default",
}: FolderPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  const tree = buildTree(folders);

  // Expand ancestors of selected value
  useEffect(() => {
    if (value) {
      const breadcrumb = buildFolderBreadcrumb(value, folders);
      const ancestors = new Set<number>();
      let currentId: number | null = value;
      while (currentId !== null) {
        const folder = folders.find((f) => f.id === currentId);
        if (folder?.parentId) {
          ancestors.add(folder.parentId);
          currentId = folder.parentId;
        } else {
          break;
        }
      }
      setExpandedIds((prev) => new Set([...Array.from(prev), ...Array.from(ancestors)]));
    }
  }, [value, folders]);

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

  const toggleExpand = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelect = (folderId: number | null) => {
    onChange(folderId);
    setIsOpen(false);
  };

  const displayValue = value
    ? formatBreadcrumb(buildFolderBreadcrumb(value, folders))
    : null;

  const renderNode = (node: FolderNode, level: number = 0) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = value === node.id;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-1 py-1.5 px-2 rounded cursor-pointer transition-colors",
            isSelected
              ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
              : "hover:bg-muted text-foreground"
          )}
          style={{ paddingLeft: `${8 + level * 16}px` }}
          onClick={() => handleSelect(node.id)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => toggleExpand(node.id, e)}
              className="p-0.5 hover:bg-muted-foreground/10 rounded"
            >
              <ChevronIcon
                className={cn(
                  "w-3 h-3 text-muted-foreground transition-transform",
                  isExpanded && "rotate-90"
                )}
              />
            </button>
          ) : (
            <span className="w-4" />
          )}
          <FolderIcon
            className={cn(
              "w-4 h-4 flex-shrink-0",
              isSelected ? "text-amber-500" : "text-amber-400"
            )}
          />
          <span className="truncate text-sm">{node.name}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={cn(
          variant === "default" && [
            "w-full px-3 py-2 border border-input rounded-lg bg-background text-left text-sm",
            "focus:outline-none focus:ring-2 focus:ring-primary/20",
            "flex items-center justify-between gap-2",
          ],
          variant === "inline" && [
            "text-xs text-muted-foreground flex items-center gap-1.5 max-w-full truncate",
            "rounded px-1.5 py-0.5 transition-all",
            "hover:bg-muted hover:text-foreground",
          ]
        )}
      >
        {variant === "inline" && (
          <FolderIcon className="w-3 h-3 flex-shrink-0" />
        )}
        <span className={cn("truncate", !displayValue && "text-muted-foreground")}>
          {displayValue || placeholder}
        </span>
        {variant === "default" && (
          <ChevronDownIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className={cn(
          "absolute z-50 mt-1 bg-background border border-border rounded-lg shadow-lg max-h-80 overflow-auto",
          variant === "default" && "w-full",
          variant === "inline" && "right-0 min-w-[200px]"
        )}>
          {/* No folder option */}
          <div
            className={cn(
              "flex items-center gap-2 py-1.5 px-3 cursor-pointer transition-colors",
              value === null
                ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
                : "hover:bg-muted text-muted-foreground"
            )}
            onClick={() => handleSelect(null)}
          >
            <span className="text-sm">No folder</span>
          </div>
          <div className="border-t border-border my-1" />
          {/* Folder tree */}
          <div className="py-1">
            {tree.map((node) => renderNode(node))}
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}
