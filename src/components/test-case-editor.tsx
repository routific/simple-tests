"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TestCase, Folder } from "@/lib/db/schema";
import { ScenarioAccordion } from "./scenario-accordion";
import {
  saveTestCase,
  deleteTestCase,
} from "@/app/cases/actions";
import { getScenarios, saveScenario } from "@/app/cases/scenario-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FolderPicker } from "@/components/folder-picker";

interface Scenario {
  id: number;
  title: string;
  gherkin: string;
  order: number;
}

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
  const [folderId, setFolderId] = useState<number | null>(
    testCase?.folderId ?? defaultFolderId ?? null
  );
  const [state, setState] = useState(testCase?.state || "active");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNew = !testCase;

  // Fetch scenarios when editing existing test case
  useEffect(() => {
    if (testCase?.id) {
      setLoadingScenarios(true);
      getScenarios(testCase.id)
        .then((data) => setScenarios(data))
        .finally(() => setLoadingScenarios(false));
    }
  }, [testCase?.id]);

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
          folderId: folderId,
          state: state as "active" | "draft" | "retired" | "rejected",
        });

        if (result.error) {
          setError(result.error);
        } else if (isNew && result.id) {
          // Create a default scenario for new test case
          await saveScenario({
            testCaseId: result.id,
            title: "Describe the test scenario here",
            gherkin: `Scenario: Describe the test scenario here
  Given some initial context or precondition
  When an action is performed
  Then the expected outcome should occur`,
            order: 0,
          });
          router.push(`/cases/${result.id}`);
        } else {
          // Save scenarios using the global function
          const saveScenariosFn = (window as Window & { __saveScenarios?: () => Promise<boolean> }).__saveScenarios;
          if (saveScenariosFn) {
            await saveScenariosFn();
          }
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
      {/* Header */}
      <div className="p-5 border-b border-border flex items-center justify-between bg-background">
        <div className="flex items-center gap-4">
          <Link
            href={`/cases${currentFolder ? `?folder=${currentFolder.id}` : ""}`}
            className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          >
            <BackIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {isNew ? "New Test Case" : "Edit Test Case"}
            </h1>
            {testCase?.legacyId && (
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-xs">
                  Testmo ID: {testCase.legacyId}
                </Badge>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <Button
              onClick={handleDelete}
              disabled={isPending}
              variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              Delete
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? (
              <>
                <LoadingIcon className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
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
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Title
            </label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., User login with valid credentials"
            />
          </div>

          {/* Folder & State */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Folder
              </label>
              <FolderPicker
                folders={folders}
                value={folderId}
                onChange={setFolderId}
                placeholder="No folder"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                State
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value as "active" | "draft" | "retired" | "rejected")}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="retired">Retired</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          {/* Scenarios */}
          {!isNew && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Scenarios
              </label>
              {loadingScenarios ? (
                <div className="text-sm text-muted-foreground">Loading scenarios...</div>
              ) : (
                <ScenarioAccordion
                  testCaseId={testCase!.id}
                  scenarios={scenarios}
                  isEditing={true}
                  onChange={setScenarios}
                />
              )}
            </div>
          )}

          {isNew && (
            <p className="text-sm text-muted-foreground">
              You can add scenarios after creating the test case.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
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
