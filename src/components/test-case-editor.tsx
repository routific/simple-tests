"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TestCase, Folder } from "@/lib/db/schema";
import { GherkinEditor } from "./gherkin-editor";
import {
  saveTestCase,
  deleteTestCase,
} from "@/app/cases/actions";

interface Props {
  testCase: TestCase | null;
  folders: Folder[];
  currentFolder?: Folder | null;
  defaultFolderId?: number | null;
}

export function TestCaseEditor({
  testCase,
  folders,
  currentFolder,
  defaultFolderId,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(testCase?.title || "");
  const [gherkin, setGherkin] = useState(testCase?.gherkin || "");
  const [folderId, setFolderId] = useState(
    testCase?.folderId || defaultFolderId || ""
  );
  const [state, setState] = useState(testCase?.state || "active");
  const [error, setError] = useState<string | null>(null);

  const isNew = !testCase;

  const handleSave = () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await saveTestCase({
          id: testCase?.id,
          title: title.trim(),
          gherkin,
          folderId: folderId ? Number(folderId) : null,
          state: state as "active" | "draft" | "retired" | "rejected",
        });

        if (result.error) {
          setError(result.error);
        } else if (isNew && result.id) {
          router.push(`/cases/${result.id}`);
        } else {
          router.refresh();
        }
      } catch {
        setError("Failed to save test case");
      }
    });
  };

  const handleDelete = () => {
    if (!testCase?.id) return;
    if (!confirm("Are you sure you want to delete this test case?")) return;

    startTransition(async () => {
      try {
        await deleteTestCase(testCase.id);
        router.push("/cases");
      } catch {
        setError("Failed to delete test case");
      }
    });
  };

  return (
    <>
      <div className="p-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/cases${currentFolder ? `?folder=${currentFolder.id}` : ""}`}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            <BackIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold">
              {isNew ? "New Test Case" : "Edit Test Case"}
            </h1>
            {testCase?.legacyId && (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Testmo ID: {testCase.legacyId}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-1.5 text-sm font-medium text-white bg-[hsl(var(--primary))] rounded-md hover:opacity-90 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., User login with valid credentials"
              className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Folder</label>
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No folder</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">State</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value as "active" | "draft" | "retired" | "rejected")}
                className="w-full px-3 py-2 border border-[hsl(var(--border))] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="retired">Retired</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Gherkin Scenarios
            </label>
            <GherkinEditor value={gherkin} onChange={setGherkin} />
          </div>
        </div>
      </div>
    </>
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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}
