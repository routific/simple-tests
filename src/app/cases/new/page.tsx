import { db } from "@/lib/db";
import { folders } from "@/lib/db/schema";
import { TestCaseEditor } from "@/components/test-case-editor";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ folder?: string }>;
}

export default async function NewTestCasePage({ searchParams }: Props) {
  const params = await searchParams;
  const folderId = params.folder ? parseInt(params.folder) : null;

  const allFolders = await db.select().from(folders).orderBy(folders.name);

  const currentFolder = folderId
    ? allFolders.find((f) => f.id === folderId)
    : null;

  return (
    <div className="h-full flex flex-col">
      <TestCaseEditor
        testCase={null}
        folders={allFolders}
        currentFolder={currentFolder}
        defaultFolderId={folderId}
      />
    </div>
  );
}
