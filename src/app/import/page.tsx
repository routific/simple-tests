"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { importTestCases, ExportData } from "@/app/cases/export-actions";

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "validating" | "importing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<ExportData | null>(null);
  const [stats, setStats] = useState<{ folders: number; testCases: number; scenarios: number } | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setStatus("validating");
    setMessage("Validating file...");

    try {
      const content = await file.text();
      const data = JSON.parse(content) as ExportData;

      // Validate structure
      if (!data.version || !data.data || !data.exportedAt) {
        throw new Error("Invalid export file format");
      }

      if (!data.data.folders || !data.data.testCases || !data.data.scenarios) {
        throw new Error("Missing required data in export file");
      }

      setPreviewData(data);
      setStatus("idle");
      setMessage("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Failed to parse file");
      setSelectedFile(null);
      setPreviewData(null);
    }
  };

  const handleImport = async () => {
    if (!previewData) return;

    const confirmed = confirm(
      "This will replace all existing test cases, folders, and scenarios. This action cannot be undone.\n\nAre you sure you want to continue?"
    );

    if (!confirmed) return;

    setStatus("importing");
    setMessage("Importing data...");

    try {
      const result = await importTestCases(previewData, { clearExisting: true });

      if (result.error) {
        setStatus("error");
        setMessage(result.error);
      } else {
        setStatus("success");
        setStats(result.stats || null);
        setMessage("Import completed successfully!");
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Failed to import");
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setStatus("idle");
    setMessage("");
    setStats(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-8 max-w-3xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/"
          className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
        >
          <BackIcon className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Import Test Cases
          </h1>
          <p className="text-muted-foreground mt-0.5">
            Restore from a previously exported JSON file
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* File Upload */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <UploadIcon className="w-5 h-5 text-brand-500" />
              Select Export File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
              id="file-input"
            />
            <label
              htmlFor="file-input"
              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <UploadCloudIcon className="w-10 h-10 text-muted-foreground mb-3" />
                <p className="mb-2 text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">JSON export file</p>
              </div>
            </label>
            {selectedFile && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <FileIcon className="w-4 h-4 text-brand-500" />
                <span className="text-foreground font-medium">{selectedFile.name}</span>
                <span className="text-muted-foreground">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
                <button
                  onClick={resetForm}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preview */}
        {previewData && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PreviewIcon className="w-5 h-5 text-brand-500" />
                Export Preview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {previewData.data.folders.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Folders</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {previewData.data.testCases.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Test Cases</div>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {previewData.data.scenarios.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Scenarios</div>
                </div>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-foreground">Exported:</span>{" "}
                  {new Date(previewData.exportedAt).toLocaleString()}
                </p>
                <p>
                  <span className="font-medium text-foreground">Version:</span>{" "}
                  {previewData.version}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Warning */}
        {previewData && (
          <Card className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30">
            <CardContent className="py-4">
              <div className="flex gap-3">
                <WarningIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-amber-800 dark:text-amber-300 mb-1">
                    Warning: Data Replacement
                  </h3>
                  <p className="text-sm text-amber-700 dark:text-amber-400/90">
                    Importing will replace all existing test cases, folders, and scenarios.
                    Make sure to export your current data first if you want to keep it.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status Messages */}
        {status === "validating" && (
          <Card className="border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <LoadingIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                <p className="text-sm text-blue-700 dark:text-blue-300">{message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {status === "importing" && (
          <Card className="border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <LoadingIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
                <p className="text-sm text-blue-700 dark:text-blue-300">{message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {status === "error" && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <ErrorIcon className="w-5 h-5 text-destructive shrink-0" />
                <p className="text-sm text-destructive">{message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {status === "success" && (
          <Card className="border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <CheckIcon className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-2">
                    {message}
                  </p>
                  {stats && (
                    <div className="text-sm text-green-700 dark:text-green-400/90 space-y-1">
                      <p>Imported {stats.folders} folders</p>
                      <p>Imported {stats.testCases} test cases</p>
                      <p>Imported {stats.scenarios} scenarios</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {previewData && status !== "success" && (
            <Button onClick={handleImport} disabled={status === "importing"}>
              {status === "importing" ? (
                <>
                  <LoadingIcon className="w-4 h-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <ImportIcon className="w-4 h-4" />
                  Import Data
                </>
              )}
            </Button>
          )}
          {status === "success" && (
            <Button onClick={() => router.push("/cases")}>
              View Test Cases
            </Button>
          )}
          <Link href="/cases">
            <Button variant="outline">
              {status === "success" ? "Close" : "Cancel"}
            </Button>
          </Link>
        </div>
      </div>
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

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function UploadCloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PreviewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function ImportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15M9 12l3 3m0 0l3-3m-3 3V2.25" />
    </svg>
  );
}

