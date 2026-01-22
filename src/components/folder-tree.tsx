"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { FolderWithChildren } from "@/lib/folders";

interface FolderTreeProps {
  folders: FolderWithChildren[];
  selectedFolderId?: number | null;
  caseCounts: Record<number, number>;
}

export function FolderTree({
  folders,
  selectedFolderId,
  caseCounts,
}: FolderTreeProps) {
  return (
    <div className="py-2">
      <Link
        href="/cases"
        className={cn(
          "flex items-center justify-between px-3 py-1.5 text-sm rounded-md",
          selectedFolderId === null
            ? "bg-white shadow-sm font-medium"
            : "hover:bg-white/50 text-[hsl(var(--muted-foreground))]"
        )}
      >
        <span>All Cases</span>
        <span className="text-xs">
          {Object.values(caseCounts).reduce((a, b) => a + b, 0)}
        </span>
      </Link>
      {folders.map((folder) => (
        <FolderItem
          key={folder.id}
          folder={folder}
          selectedFolderId={selectedFolderId}
          caseCounts={caseCounts}
          level={0}
        />
      ))}
    </div>
  );
}

function FolderItem({
  folder,
  selectedFolderId,
  caseCounts,
  level,
}: {
  folder: FolderWithChildren;
  selectedFolderId?: number | null;
  caseCounts: Record<number, number>;
  level: number;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = folder.children.length > 0;
  const isSelected = selectedFolderId === folder.id;
  const count = caseCounts[folder.id] || 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-3 py-1.5 text-sm rounded-md group",
          isSelected
            ? "bg-white shadow-sm font-medium"
            : "hover:bg-white/50 text-[hsl(var(--muted-foreground))]"
        )}
        style={{ paddingLeft: `${12 + level * 16}px` }}
      >
        {hasChildren && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-0.5 hover:bg-gray-200 rounded"
          >
            <ChevronIcon
              className={cn("w-3 h-3 transition-transform", isOpen && "rotate-90")}
            />
          </button>
        )}
        {!hasChildren && <span className="w-4" />}
        <Link
          href={`/cases?folder=${folder.id}`}
          className="flex-1 truncate"
        >
          {folder.name}
        </Link>
        {count > 0 && <span className="text-xs opacity-60">{count}</span>}
      </div>
      {hasChildren && isOpen && (
        <div>
          {folder.children.map((child) => (
            <FolderItem
              key={child.id}
              folder={child}
              selectedFolderId={selectedFolderId}
              caseCounts={caseCounts}
              level={level + 1}
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

