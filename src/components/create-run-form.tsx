"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { createTestRun } from "@/app/runs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

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
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between bg-background">
        <div className="flex items-center gap-4">
          <Link
            href="/runs"
            className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          >
            <BackIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Create Test Run</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select test cases to include in this run
            </p>
          </div>
        </div>
        <Button onClick={handleCreate} disabled={isPending}>
          {isPending ? (
            <>
              <LoadingIcon className="w-4 h-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Create Run"
          )}
        </Button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm flex items-center gap-3">
          <ErrorIcon className="w-5 h-5 shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl space-y-6">
          {/* Run Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Run Name
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Release 2.0 Regression"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Full regression for v2.0 release"
              />
            </div>
          </div>

          {/* Test Case Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Select Test Cases
                </label>
                <p className="text-sm text-muted-foreground">
                  {selectedCases.size} case{selectedCases.size !== 1 ? "s" : ""} selected
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={selectAll}
                  className="text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium"
                >
                  Select all
                </button>
                <span className="text-border">|</span>
                <button
                  onClick={clearAll}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            </div>

            <Card>
              <CardContent className="p-0 max-h-96 overflow-auto">
                {folders.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                      <FolderIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground mb-1">No test cases available</p>
                    <p className="text-sm text-muted-foreground">
                      <Link href="/import" className="text-brand-500 hover:underline">
                        Import test cases
                      </Link>{" "}
                      first to create a run.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
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
                      <div className="p-4">
                        <div className="text-sm font-medium text-muted-foreground mb-3">
                          Uncategorized
                        </div>
                        <div className="space-y-1">
                          {cases
                            .filter((c) => !c.folderId)
                            .map((testCase) => (
                              <label
                                key={testCase.id}
                                className="flex items-center gap-3 py-1.5 cursor-pointer hover:text-foreground transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedCases.has(testCase.id)}
                                  onChange={() => toggleCase(testCase.id)}
                                  className="rounded border-input text-brand-600 focus:ring-brand-500"
                                />
                                <span className="text-sm truncate text-muted-foreground">
                                  {testCase.title}
                                </span>
                              </label>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
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
  const selectedInFolder = cases.filter((c) => selectedCases.has(c.id)).length;

  if (count === 0) return null;

  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 hover:bg-muted rounded transition-colors"
        >
          <ChevronIcon
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-90"
            )}
          />
        </button>
        <label className="flex items-center gap-3 cursor-pointer flex-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleFolder(folder.id)}
            className="rounded border-input text-brand-600 focus:ring-brand-500"
          />
          <FolderIcon className="w-4 h-4 text-amber-500" />
          <span className="font-medium text-foreground">{folder.name}</span>
          <span className="text-sm text-muted-foreground">
            {selectedInFolder > 0 && selectedInFolder < count
              ? `${selectedInFolder}/${count}`
              : `(${count})`}
          </span>
        </label>
      </div>

      {isOpen && (
        <div className="ml-10 mt-3 space-y-1 animate-fade-in">
          {cases.map((testCase) => (
            <label
              key={testCase.id}
              className="flex items-center gap-3 py-1.5 cursor-pointer group"
            >
              <input
                type="checkbox"
                checked={selectedCases.has(testCase.id)}
                onChange={() => toggleCase(testCase.id)}
                className="rounded border-input text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm truncate text-muted-foreground group-hover:text-foreground transition-colors">
                {testCase.title}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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

function LoadingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
