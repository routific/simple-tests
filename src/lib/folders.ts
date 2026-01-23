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

/**
 * Build breadcrumb path from root to target folder
 * Returns array of folder names: ["Parent", "Child", "Grandchild"]
 */
export function buildFolderBreadcrumb(
  folderId: number | null,
  folders: Pick<Folder, "id" | "name" | "parentId">[]
): string[] {
  if (!folderId) return [];

  const folderMap = new Map(folders.map((f) => [f.id, f]));
  const path: string[] = [];
  let currentId: number | null = folderId;

  while (currentId !== null) {
    const folder = folderMap.get(currentId);
    if (!folder) break;
    path.unshift(folder.name);
    currentId = folder.parentId;
  }

  return path;
}

/**
 * Format breadcrumb array as display string
 * ["Parent", "Child", "Grandchild"] -> "Parent > Child > Grandchild"
 */
export function formatBreadcrumb(path: string[], separator = " > "): string {
  return path.join(separator);
}

/**
 * Get all descendant folder IDs for a given folder (recursive)
 * Returns array including the folder itself and all its descendants
 */
export function getDescendantFolderIds(
  folderId: number,
  folders: Pick<Folder, "id" | "parentId">[]
): number[] {
  const result: number[] = [folderId];

  function collectChildren(parentId: number) {
    const children = folders.filter((f) => f.parentId === parentId);
    for (const child of children) {
      result.push(child.id);
      collectChildren(child.id);
    }
  }

  collectChildren(folderId);
  return result;
}
