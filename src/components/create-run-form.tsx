"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createTestRun } from "@/app/runs/actions";

interface Folder {
  id: number;
  name: string;
  parentId: number | null;
  order: number;
  caseCount: number;
  children: Folder[];
}

interface TestCase {
  id: number;
  title: string;
  folderId: number | null;
  folderName: string | null;
}

interface Props {
  folders: Folder[];
  cases: TestCase[];
  caseCounts: Record<number, number>;
}

export function CreateRunForm({ folders, cases, caseCounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCases, setSelectedCases] = useState<Set<number>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const toggleFolder = (folderId: number) => {
    const newSelectedFolders = new Set(selectedFolders);
    const newSelectedCases = new Set(selectedCases);
    const folderCases = cases.filter((c) => c.folderId === folderId);

    if (selectedFolders.has(folderId)) {
      newSelectedFolders.delete(folderId);
      folderCases.forEach((c) => newSelectedCases.delete(c.id));
    } else {
      newSelectedFolders.add(folderId);
      folderCases.forEach((c) => newSelectedCases.add(c.id));
    }

    setSelectedFolders(newSelectedFolders);
    setSelectedCases(newSelectedCases);
  };

  const toggleCase = (caseId: number) => {
    const newSelectedCases = new Set(selectedCases);
    if (newSelectedCases.has(caseId)) {
      newSelectedCases.delete(caseId);
    } else {
      newSelectedCases.add(caseId);
    }
    setSelectedCases(newSelectedCases);
  };

  const selectAll = () => {
    setSelectedCases(new Set(cases.map((c) => c.id)));
    setSelectedFolders(new Set(folders.map((f) => f.id)));
  };

  const clearAll = () => {
    setSelectedCases(new Set());
    setSelectedFolders(new Set());
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Run name is required");
      return;
    }
    if (selectedCases.size === 0) {
      setError("Select at least one test case");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await createTestRun({
          name: name.trim(),
          description: description.trim() || null,
          caseIds: Array.from(selectedCases),
        });

        if (result.error) {
          setError(result.error);
        } else if (result.id) {
          router.push(`/runs/${result.id}`);
        }
      } catch {
        setError("Failed to create test run");
      }
    });
  };

  return (
    <>
      <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/runs"
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <BackIcon className="w-5 h-5" />
          </Link>
          <h1 className="text-xl font-semibold">Create Test Run</h1>
        </div>
        <button
          onClick={handleCreate}
          disabled={isPending}
          className="px-4 py-1.5 text-sm font-medium text-white bg-[hsl(var(--primary))] rounded-md hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Creating..." : "Create Run"}
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Run Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Release 2.0 Regression"
                className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Full regression for v2.0 release"
                className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">
                Select Test Cases ({selectedCases.size} selected)
              </label>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Select all
                </button>
                <span className="text-gray-300">|</span>
                <button
                  onClick={clearAll}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="border rounded-lg max-h-96 overflow-auto">
              {folders.length === 0 ? (
                <div className="p-4 text-center text-[hsl(var(--muted-foreground))]">
                  No test cases available. Import test cases first.
                </div>
              ) : (
                <div className="divide-y">
                  {folders.map((folder) => (
                    <FolderSection
                      key={folder.id}
                      folder={folder}
                      cases={cases.filter((c) => c.folderId === folder.id)}
                      selectedCases={selectedCases}
                      selectedFolders={selectedFolders}
                      toggleFolder={toggleFolder}
                      toggleCase={toggleCase}
                      caseCounts={caseCounts}
                    />
                  ))}
                  {/* Cases without folder */}
                  {cases.filter((c) => !c.folderId).length > 0 && (
                    <div className="p-3">
                      <div className="text-sm font-medium text-[hsl(var(--muted-foreground))] mb-2">
                        Uncategorized
                      </div>
                      {cases
                        .filter((c) => !c.folderId)
                        .map((testCase) => (
                          <label
                            key={testCase.id}
                            className="flex items-center gap-2 py-1 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedCases.has(testCase.id)}
                              onChange={() => toggleCase(testCase.id)}
                              className="rounded"
                            />
                            <span className="text-sm truncate">
                              {testCase.title}
                            </span>
                          </label>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function FolderSection({
  folder,
  cases,
  selectedCases,
  selectedFolders,
  toggleFolder,
  toggleCase,
  caseCounts,
}: {
  folder: Folder;
  cases: TestCase[];
  selectedCases: Set<number>;
  selectedFolders: Set<number>;
  toggleFolder: (id: number) => void;
  toggleCase: (id: number) => void;
  caseCounts: Record<number, number>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const count = caseCounts[folder.id] || 0;
  const isSelected = selectedFolders.has(folder.id);

  if (count === 0) return null;

  return (
    <div className="p-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-0.5 hover:bg-gray-100 rounded"
        >
          <ChevronIcon
            className={cn("w-4 h-4 transition-transform", isOpen && "rotate-90")}
          />
        </button>
        <label className="flex items-center gap-2 cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleFolder(folder.id)}
            className="rounded"
          />
          <span className="font-medium">{folder.name}</span>
          <span className="text-sm text-[hsl(var(--muted-foreground))]">
            ({count})
          </span>
        </label>
      </div>

      {isOpen && (
        <div className="ml-8 mt-2 space-y-1">
          {cases.map((testCase) => (
            <label
              key={testCase.id}
              className="flex items-center gap-2 py-1 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedCases.has(testCase.id)}
                onChange={() => toggleCase(testCase.id)}
                className="rounded"
              />
              <span className="text-sm truncate">{testCase.title}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
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
