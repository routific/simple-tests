import { eq, and, sql, isNull } from "drizzle-orm";
import { db, folders, testCases, type Folder } from "../shared/index.js";
import { AuthContext } from "../auth/index.js";
import type { Resource } from "@modelcontextprotocol/sdk/types.js";

interface FolderNode extends Folder {
  children: FolderNode[];
  testCaseCount: number;
}

export function registerFolderResources(): Resource[] {
  return [
    {
      uri: "folders://tree",
      name: "Folder Tree",
      description: "Full folder hierarchy with test case counts",
      mimeType: "application/json",
    },
    {
      uri: "folders://{id}",
      name: "Single Folder",
      description: "Get a specific folder with its children",
      mimeType: "application/json",
    },
  ];
}

export async function handleFolderResource(
  uri: string,
  auth: AuthContext
): Promise<{ contents: Array<{ uri: string; mimeType: string; text: string }> }> {
  if (uri === "folders://tree") {
    return getFolderTree(auth);
  }

  const match = uri.match(/^folders:\/\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    return getSingleFolder(id, auth);
  }

  throw new Error(`Invalid folder resource URI: ${uri}`);
}

async function getFolderTree(auth: AuthContext) {
  // Get all folders for the organization
  const allFolders = await db
    .select()
    .from(folders)
    .where(eq(folders.organizationId, auth.organizationId))
    .orderBy(folders.order);

  // Get test case counts per folder
  const counts = await db
    .select({
      folderId: testCases.folderId,
      count: sql<number>`count(*)`,
    })
    .from(testCases)
    .where(eq(testCases.organizationId, auth.organizationId))
    .groupBy(testCases.folderId);

  const countMap = new Map(counts.map((c) => [c.folderId, c.count]));

  // Build tree structure
  const folderMap = new Map<number, FolderNode>();
  const rootFolders: FolderNode[] = [];

  // First pass: create nodes
  for (const folder of allFolders) {
    folderMap.set(folder.id, {
      ...folder,
      children: [],
      testCaseCount: countMap.get(folder.id) || 0,
    });
  }

  // Second pass: build tree
  for (const folder of allFolders) {
    const node = folderMap.get(folder.id)!;
    if (folder.parentId === null) {
      rootFolders.push(node);
    } else {
      const parent = folderMap.get(folder.parentId);
      if (parent) {
        parent.children.push(node);
      }
    }
  }

  return {
    contents: [
      {
        uri: "folders://tree",
        mimeType: "application/json",
        text: JSON.stringify(rootFolders, null, 2),
      },
    ],
  };
}

async function getSingleFolder(id: number, auth: AuthContext) {
  const folder = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.id, id),
        eq(folders.organizationId, auth.organizationId)
      )
    )
    .limit(1);

  if (folder.length === 0) {
    throw new Error(`Folder not found: ${id}`);
  }

  // Get children
  const children = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.parentId, id),
        eq(folders.organizationId, auth.organizationId)
      )
    )
    .orderBy(folders.order);

  // Get test case count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(testCases)
    .where(
      and(
        eq(testCases.folderId, id),
        eq(testCases.organizationId, auth.organizationId)
      )
    );

  const result = {
    ...folder[0],
    children,
    testCaseCount: countResult[0]?.count || 0,
  };

  return {
    contents: [
      {
        uri: `folders://${id}`,
        mimeType: "application/json",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
