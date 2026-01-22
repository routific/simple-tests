"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { FolderWithChildren } from "@/lib/folders";
import {
  createFolder,
  renameFolder,
  deleteFolder,
  moveFolder,
  moveTestCaseToFolder,
} from "@/app/folders/actions";

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

// Check if targetId is a descendant of folderId
function isDescendantOf(
  folders: FolderWithChildren[],
  folderId: number,
  targetId: number
): boolean {
  function findFolder(list: FolderWithChildren[], id: number): FolderWithChildren | null {
    for (const f of list) {
      if (f.id === id) return f;
      const found = findFolder(f.children, id);
      if (found) return found;
    }
    return null;
  }

  function hasDescendant(folder: FolderWithChildren, id: number): boolean {
    for (const child of folder.children) {
      if (child.id === id) return true;
      if (hasDescendant(child, id)) return true;
    }
    return false;
  }

  const folder = findFolder(folders, folderId);
  return folder ? hasDescendant(folder, targetId) : false;
}

interface DragState {
  type: "folder" | "testcase";
  id: number;
  name: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  folderId: number;
  folderName: string;
  parentId: number | null;
}

export function FolderTree({
  folders,
  selectedFolderId,
  caseCounts,
}: FolderTreeProps) {
  const router = useRouter();

  // Calculate which folders should be expanded (ancestors of selected)
  const expandedByDefault = useMemo(() => {
    if (!selectedFolderId) return new Set<number>();
    return getAncestorPath(folders, selectedFolderId);
  }, [folders, selectedFolderId]);

  // Track expanded state globally
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    folders.forEach((f) => initial.add(f.id));
    expandedByDefault.forEach((id) => initial.add(id));
    return initial;
  });

  const allFolderIds = useMemo(() => getAllFolderIds(folders), [folders]);

  // Drag state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<number | "root" | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // New folder state
  const [newFolderParentId, setNewFolderParentId] = useState<number | null | "root">(null);
  const [newFolderName, setNewFolderName] = useState("");

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

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleClick);
      return () => document.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.DragEvent, type: "folder" | "testcase", id: number, name: string) => {
      setDragState({ type, id, name });
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", JSON.stringify({ type, id }));
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, targetId: number | "root") => {
      e.preventDefault();
      e.stopPropagation();

      // Check for external test case drag from the list
      const externalDrag = (window as unknown as { __draggedTestCase?: { id: number; name: string } }).__draggedTestCase;
      const currentDragState = dragState || (externalDrag ? { type: "testcase" as const, ...externalDrag } : null);

      if (!currentDragState) return;

      // Prevent dropping folder on itself or its descendants
      if (currentDragState.type === "folder" && typeof targetId === "number") {
        if (currentDragState.id === targetId) return;
        if (isDescendantOf(folders, currentDragState.id, targetId)) return;
      }

      setDropTarget(targetId);
      e.dataTransfer.dropEffect = "move";
    },
    [dragState, folders]
  );

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetId: number | "root") => {
      e.preventDefault();
      e.stopPropagation();

      // Check for external test case drag from the list
      const externalDrag = (window as unknown as { __draggedTestCase?: { id: number; name: string } }).__draggedTestCase;
      const currentDragState = dragState || (externalDrag ? { type: "testcase" as const, ...externalDrag } : null);

      if (!currentDragState) return;

      const newParentId = targetId === "root" ? null : targetId;

      if (currentDragState.type === "folder") {
        // Prevent dropping folder on itself or its descendants
        if (typeof targetId === "number") {
          if (currentDragState.id === targetId) return;
          if (isDescendantOf(folders, currentDragState.id, targetId)) return;
        }

        const result = await moveFolder(currentDragState.id, newParentId, 0);
        if (result.error) {
          alert(result.error);
        } else {
          router.refresh();
          // Expand the target folder
          if (typeof targetId === "number") {
            setExpandedFolders((prev) => new Set([...Array.from(prev), targetId]));
          }
        }
      } else if (currentDragState.type === "testcase") {
        const result = await moveTestCaseToFolder(currentDragState.id, newParentId);
        if (result.error) {
          alert(result.error);
        } else {
          router.refresh();
        }
      }

      // Clean up external drag state
      delete (window as unknown as { __draggedTestCase?: { id: number; name: string } }).__draggedTestCase;
      setDragState(null);
      setDropTarget(null);
    },
    [dragState, folders, router]
  );

  // Context menu handlers
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, folderId: number, folderName: string, parentId: number | null) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, folderId, folderName, parentId });
    },
    []
  );

  const handleRename = useCallback(() => {
    if (!contextMenu) return;
    setRenamingId(contextMenu.folderId);
    setRenameValue(contextMenu.folderName);
    setContextMenu(null);
  }, [contextMenu]);

  const handleRenameSubmit = useCallback(async () => {
    if (!renamingId || !renameValue.trim()) {
      setRenamingId(null);
      return;
    }

    const result = await renameFolder(renamingId, renameValue.trim());
    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
    setRenamingId(null);
    setRenameValue("");
  }, [renamingId, renameValue, router]);

  const handleDelete = useCallback(async () => {
    if (!contextMenu) return;
    if (!confirm(`Delete folder "${contextMenu.folderName}"?`)) return;

    const result = await deleteFolder(contextMenu.folderId);
    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
    setContextMenu(null);
  }, [contextMenu, router]);

  const handleAddSubfolder = useCallback(() => {
    if (!contextMenu) return;
    setNewFolderParentId(contextMenu.folderId);
    setNewFolderName("");
    setExpandedFolders((prev) => new Set([...Array.from(prev), contextMenu.folderId]));
    setContextMenu(null);
  }, [contextMenu]);

  const handleNewFolderSubmit = useCallback(async () => {
    if (!newFolderName.trim()) {
      setNewFolderParentId(null);
      return;
    }

    const parentId = newFolderParentId === "root" ? null : newFolderParentId;
    const result = await createFolder({ name: newFolderName.trim(), parentId });
    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
    setNewFolderParentId(null);
    setNewFolderName("");
  }, [newFolderParentId, newFolderName, router]);

  const totalCount = Object.values(caseCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="py-2 text-sm relative">
      {/* Header with buttons */}
      <div className="flex items-center justify-between px-3 mb-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleExpandAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
          >
            Expand
          </button>
          <span className="text-muted-foreground/50">|</span>
          <button
            onClick={handleCollapseAll}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
          >
            Collapse
          </button>
        </div>
        <button
          onClick={() => {
            setNewFolderParentId("root");
            setNewFolderName("");
          }}
          className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          title="New folder"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>

      {/* All Cases - Drop target for root level */}
      <div
        onDragOver={(e) => handleDragOver(e, "root")}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, "root")}
      >
        <Link
          href="/cases"
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg mx-2 transition-colors",
            selectedFolderId === null
              ? "bg-brand-500/10 text-brand-600 dark:text-brand-400 font-medium"
              : "hover:bg-muted text-muted-foreground hover:text-foreground",
            dropTarget === "root" && dragState?.type === "testcase" && "ring-2 ring-brand-500 bg-brand-500/10"
          )}
        >
          <FolderIcon className="w-4 h-4 text-amber-500" />
          <span className="flex-1">All Cases</span>
          <span className="text-xs text-muted-foreground tabular-nums">{totalCount}</span>
        </Link>
      </div>

      {/* New folder input at root level */}
      {newFolderParentId === "root" && (
        <NewFolderInput
          value={newFolderName}
          onChange={setNewFolderName}
          onSubmit={handleNewFolderSubmit}
          onCancel={() => setNewFolderParentId(null)}
          level={0}
        />
      )}

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
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onContextMenu={handleContextMenu}
            dragState={dragState}
            dropTarget={dropTarget}
            renamingId={renamingId}
            renameValue={renameValue}
            onRenameChange={setRenameValue}
            onRenameSubmit={handleRenameSubmit}
            newFolderParentId={newFolderParentId}
            newFolderName={newFolderName}
            onNewFolderNameChange={setNewFolderName}
            onNewFolderSubmit={handleNewFolderSubmit}
            onNewFolderCancel={() => setNewFolderParentId(null)}
          />
        ))}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onRename={handleRename}
          onDelete={handleDelete}
          onAddSubfolder={handleAddSubfolder}
        />
      )}

      {/* Drag indicator */}
      {dragState && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-3 py-2 bg-foreground text-background rounded-lg shadow-lg text-sm font-medium z-50">
          Moving "{dragState.name}"
        </div>
      )}
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
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
  dragState,
  dropTarget,
  renamingId,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  newFolderParentId,
  newFolderName,
  onNewFolderNameChange,
  onNewFolderSubmit,
  onNewFolderCancel,
}: {
  folder: FolderWithChildren;
  selectedFolderId?: number | null;
  caseCounts: Record<number, number>;
  level: number;
  expandedFolders: Set<number>;
  toggleFolder: (id: number) => void;
  isLast: boolean;
  onDragStart: (e: React.DragEvent, type: "folder" | "testcase", id: number, name: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, targetId: number | "root") => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetId: number | "root") => void;
  onContextMenu: (e: React.MouseEvent, folderId: number, folderName: string, parentId: number | null) => void;
  dragState: DragState | null;
  dropTarget: number | "root" | null;
  renamingId: number | null;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameSubmit: () => void;
  newFolderParentId: number | null | "root";
  newFolderName: string;
  onNewFolderNameChange: (value: string) => void;
  onNewFolderSubmit: () => void;
  onNewFolderCancel: () => void;
}) {
  const isOpen = expandedFolders.has(folder.id);
  const hasChildren = folder.children.length > 0;
  const isSelected = selectedFolderId === folder.id;
  const isRenaming = renamingId === folder.id;
  const isDragging = dragState?.type === "folder" && dragState.id === folder.id;
  const isDropTarget = dropTarget === folder.id;
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus rename input when it appears
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

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
    <div className={cn("relative", isDragging && "opacity-50")}>
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
        draggable={!isRenaming}
        onDragStart={(e) => onDragStart(e, "folder", folder.id, folder.name)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => onDragOver(e, folder.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, folder.id)}
        onContextMenu={(e) => onContextMenu(e, folder.id, folder.name, folder.parentId ?? null)}
        className={cn(
          "flex items-center gap-2 py-2 pr-2 rounded-lg mx-2 relative transition-all cursor-grab",
          isSelected
            ? "bg-brand-500/10 text-brand-600 dark:text-brand-400 font-medium"
            : "hover:bg-muted text-muted-foreground hover:text-foreground",
          isDropTarget && "ring-2 ring-brand-500 bg-brand-500/10"
        )}
        style={{ paddingLeft: `${12 + level * 20}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFolder(folder.id);
            }}
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

        {isRenaming ? (
          <input
            ref={renameInputRef}
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameSubmit();
              if (e.key === "Escape") {
                onRenameChange("");
                onRenameSubmit();
              }
            }}
            className="flex-1 bg-background border border-input rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <Link
            href={`/cases?folder=${folder.id}`}
            className="flex-1 truncate px-1"
            onClick={(e) => e.stopPropagation()}
          >
            {folder.name}
          </Link>
        )}

        {totalCount > 0 && !isRenaming && (
          <span className="text-xs text-muted-foreground tabular-nums">
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
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onContextMenu={onContextMenu}
              dragState={dragState}
              dropTarget={dropTarget}
              renamingId={renamingId}
              renameValue={renameValue}
              onRenameChange={onRenameChange}
              onRenameSubmit={onRenameSubmit}
              newFolderParentId={newFolderParentId}
              newFolderName={newFolderName}
              onNewFolderNameChange={onNewFolderNameChange}
              onNewFolderSubmit={onNewFolderSubmit}
              onNewFolderCancel={onNewFolderCancel}
            />
          ))}
          {/* New folder input as child */}
          {newFolderParentId === folder.id && (
            <NewFolderInput
              value={newFolderName}
              onChange={onNewFolderNameChange}
              onSubmit={onNewFolderSubmit}
              onCancel={onNewFolderCancel}
              level={level + 1}
            />
          )}
        </div>
      )}

      {/* New folder input as child when folder has no children yet */}
      {!hasChildren && newFolderParentId === folder.id && (
        <div className="animate-fade-in">
          <NewFolderInput
            value={newFolderName}
            onChange={onNewFolderNameChange}
            onSubmit={onNewFolderSubmit}
            onCancel={onNewFolderCancel}
            level={level + 1}
          />
        </div>
      )}
    </div>
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
      className="flex items-center gap-1.5 py-1.5 mx-2"
      style={{ paddingLeft: `${8 + level * 20 + 20}px` }}
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
        placeholder="New folder name..."
        className="flex-1 bg-background border border-input rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
    </div>
  );
}

function ContextMenu({
  x,
  y,
  onRename,
  onDelete,
  onAddSubfolder,
}: {
  x: number;
  y: number;
  onRename: () => void;
  onDelete: () => void;
  onAddSubfolder: () => void;
}) {
  return (
    <div
      className="fixed z-50 bg-background border border-border rounded-lg shadow-elevated py-1 min-w-[160px] animate-fade-in"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onAddSubfolder}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors text-left"
      >
        <PlusIcon className="w-4 h-4" />
        Add subfolder
      </button>
      <button
        onClick={onRename}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors text-left"
      >
        <EditIcon className="w-4 h-4" />
        Rename
      </button>
      <div className="h-px bg-border my-1" />
      <button
        onClick={onDelete}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
      >
        <TrashIcon className="w-4 h-4" />
        Delete
      </button>
    </div>
  );
}

// Icons
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

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
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
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
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
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
