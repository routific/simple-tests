"use client";

import { useRouter } from "next/navigation";
import { FolderTree } from "@/components/folder-tree";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import type { FolderWithChildren } from "@/lib/folders";

interface FolderPanelProps {
  folders: FolderWithChildren[];
  selectedFolderId: number | null;
  caseCounts: Record<number, number>;
  stateFilter: string;
}

export function FolderPanel({
  folders,
  selectedFolderId,
  caseCounts,
  stateFilter,
}: FolderPanelProps) {
  const router = useRouter();

  const handleStateFilterChange = (value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set("state", value);
    } else {
      params.delete("state");
    }
    // Reset offset when filter changes
    params.delete("offset");
    router.push(`/cases?${params.toString()}`);
  };

  return (
    <ResizablePanel
      defaultWidth={256}
      minWidth={180}
      maxWidth={400}
      storageKey="folder-panel-width"
      className="border-r border-border bg-muted/30 overflow-auto h-full"
    >
      <div className="p-4 border-b border-border sticky top-0 bg-muted/30 backdrop-blur-sm z-10">
        <h2 className="font-medium text-sm text-foreground">Folders</h2>
        <select
          value={stateFilter}
          onChange={(e) => handleStateFilterChange(e.target.value)}
          className="mt-2 w-full px-2 py-1.5 text-xs border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
        >
          <option value="">All states</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="retired">Retired</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <FolderTree
        folders={folders}
        selectedFolderId={selectedFolderId}
        caseCounts={caseCounts}
      />
    </ResizablePanel>
  );
}
