"use client";

import { useState } from "react";
import Link from "next/link";

export default function ImportPage() {
  const [status, setStatus] = useState<"idle" | "importing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleImport = async () => {
    setStatus("importing");
    setMessage("Running import script... Check terminal for progress.");

    // The import is run via CLI: npm run import
    // This page just provides instructions
    setTimeout(() => {
      setStatus("idle");
      setMessage("");
    }, 3000);
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
        >
          <BackIcon className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-semibold">Import from Testmo</h1>
      </div>

      <div className="space-y-6">
        <div className="p-4 bg-[hsl(var(--muted))] rounded-lg">
          <h2 className="font-medium mb-2">How to Import</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-[hsl(var(--muted-foreground))]">
            <li>Export your test cases from Testmo as CSV</li>
            <li>Place the CSV file in the project root directory</li>
            <li>Run the import command in your terminal</li>
          </ol>
        </div>

        <div className="p-4 border rounded-lg">
          <h3 className="font-medium mb-2">Import Command</h3>
          <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm">
            npm run import ./testmo-export-repository-1.csv
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">
            Replace the filename with your CSV export file.
          </p>
        </div>

        <div className="p-4 border rounded-lg">
          <h3 className="font-medium mb-2">What Gets Imported</h3>
          <ul className="text-sm text-[hsl(var(--muted-foreground))] space-y-1">
            <li>- Test case titles and IDs</li>
            <li>- Gherkin/BDD scenarios (HTML decoded)</li>
            <li>- Folder structure</li>
            <li>- Case states (Active, Draft, Retired, Rejected)</li>
            <li>- Created/Updated timestamps</li>
          </ul>
        </div>

        <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
          <h3 className="font-medium text-yellow-800 mb-1">Note</h3>
          <p className="text-sm text-yellow-700">
            The import script will create new folders and test cases. Running it
            multiple times may create duplicates. Make sure your database is set
            up before importing.
          </p>
        </div>

        {message && (
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-md text-sm">
            {message}
          </div>
        )}

        <div className="flex gap-3">
          <Link
            href="/cases"
            className="px-4 py-2 text-sm font-medium text-white bg-[hsl(var(--primary))] rounded-md hover:opacity-90"
          >
            View Test Cases
          </Link>
        </div>
      </div>
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
