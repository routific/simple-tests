"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { buildFolderBreadcrumb, formatBreadcrumb } from "@/lib/folders";
import { createFolder } from "@/app/folders/actions";

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

interface ContextMenuState {
  x: number;
  y: number;
  folderId: number | null; // null = root level
}

export function FolderPicker({
  folders,
  value,
  onChange,
  placeholder = "Select folder...",
  className,
  variant = "default",
}: FolderPickerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [newFolderParentId, setNewFolderParentId] = useState<number | null | "none">("none");
  const [newFolderName, setNewFolderName] = useState("");
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
        setContextMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close context menu on any click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, folderId: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, folderId });
  };

  const handleAddSubfolder = () => {
    if (!contextMenu) return;
    setNewFolderParentId(contextMenu.folderId);
    setNewFolderName("");
    // Expand the parent folder if it's not root
    if (contextMenu.folderId !== null) {
      setExpandedIds((prev) => new Set([...Array.from(prev), contextMenu.folderId!]));
    }
    setContextMenu(null);
  };

  const handleNewFolderSubmit = async () => {
    if (!newFolderName.trim() || newFolderParentId === "none") {
      setNewFolderParentId("none");
      setNewFolderName("");
      return;
    }

    const parentId = newFolderParentId === null ? null : newFolderParentId;
    const result = await createFolder({ name: newFolderName.trim(), parentId });
    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
    setNewFolderParentId("none");
    setNewFolderName("");
  };

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
    const showNewFolderInput = newFolderParentId === node.id;

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
          onContextMenu={(e) => handleContextMenu(e, node.id)}
        >
          {hasChildren || showNewFolderInput ? (
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
        {(hasChildren || showNewFolderInput) && isExpanded && (
          <div>
            {node.children.map((child) => renderNode(child, level + 1))}
            {showNewFolderInput && (
              <NewFolderInput
                value={newFolderName}
                onChange={setNewFolderName}
                onSubmit={handleNewFolderSubmit}
                onCancel={() => setNewFolderParentId("none")}
                level={level + 1}
              />
            )}
          </div>
        )}
        {/* Show new folder input when folder has no children yet */}
        {!hasChildren && showNewFolderInput && !isExpanded && (
          <div>
            <NewFolderInput
              value={newFolderName}
              onChange={setNewFolderName}
              onSubmit={handleNewFolderSubmit}
              onCancel={() => setNewFolderParentId("none")}
              level={level + 1}
            />
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
        <div
          className={cn(
            "absolute z-50 mt-1 bg-background border border-border rounded-lg shadow-lg max-h-80 overflow-auto",
            variant === "default" && "w-full",
            variant === "inline" && "right-0 min-w-[200px]"
          )}
          onContextMenu={(e) => handleContextMenu(e, null)}
        >
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
            {/* New folder input at root level */}
            {newFolderParentId === null && (
              <NewFolderInput
                value={newFolderName}
                onChange={setNewFolderName}
                onSubmit={handleNewFolderSubmit}
                onCancel={() => setNewFolderParentId("none")}
                level={0}
              />
            )}
          </div>
        </div>
      )}

      {/* Context Menu - rendered via portal to escape transform containers */}
      {contextMenu && typeof document !== "undefined" && createPortal(
        <div
          className="fixed z-[100] bg-background border border-border rounded-lg shadow-elevated py-1 min-w-[140px] animate-fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleAddSubfolder}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors text-left"
          >
            <PlusIcon className="w-4 h-4" />
            {contextMenu.folderId === null ? "New folder" : "Add subfolder"}
          </button>
        </div>,
        document.body
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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function NewFolderInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  level,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  level: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="flex items-center gap-1 py-1 px-2"
      style={{ paddingLeft: `${8 + level * 16 + 20}px` }}
    >
      <FolderIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value.trim()) onCancel();
          else onSubmit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="New folder..."
        className="flex-1 bg-background border border-input rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-0"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
