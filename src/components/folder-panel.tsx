"use client";

import { FolderTree } from "@/components/folder-tree";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import type { FolderWithChildren } from "@/lib/folders";

interface FolderPanelProps {
  folders: FolderWithChildren[];
  selectedFolderId: number | null;
  caseCounts: Record<number, number>;
}

export function FolderPanel({
  folders,
  selectedFolderId,
  caseCounts,
}: FolderPanelProps) {
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
      </div>
      <FolderTree
        folders={folders}
        selectedFolderId={selectedFolderId}
        caseCounts={caseCounts}
      />
    </ResizablePanel>
  );
}
