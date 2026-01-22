import type { Folder } from "./db/schema";

export interface FolderWithChildren extends Folder {
  children: FolderWithChildren[];
  caseCount: number;
}

export function buildFolderTree(
  folders: (Folder & { caseCount: number })[],
  parentId: number | null = null
): FolderWithChildren[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((folder) => ({
      ...folder,
      children: buildFolderTree(folders, folder.id),
    }));
}
