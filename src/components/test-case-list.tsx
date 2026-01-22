"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface TestCase {
  id: number;
  title: string;
  state: string;
  template: string;
  updatedAt: Date | null;
  folderName: string | null;
}

interface Props {
  cases: TestCase[];
  folderId: number | null;
  search: string;
  stateFilter: string;
}

export function TestCaseList({ cases, folderId, search, stateFilter }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateSearch = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/cases?${params.toString()}`);
  };

  return (
    <div>
      <div className="p-3 border-b border-[hsl(var(--border))] flex gap-3">
        <input
          type="text"
          placeholder="Search test cases..."
          defaultValue={search}
          onChange={(e) => {
            const value = e.target.value;
            if (value.length === 0 || value.length >= 2) {
              updateSearch("q", value);
            }
          }}
          className="flex-1 px-3 py-1.5 text-sm border border-[hsl(var(--border))] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={stateFilter}
          onChange={(e) => updateSearch("state", e.target.value)}
          className="px-3 py-1.5 text-sm border border-[hsl(var(--border))] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All states</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="retired">Retired</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {cases.length === 0 ? (
        <div className="p-8 text-center text-[hsl(var(--muted-foreground))]">
          No test cases found.
          {search && " Try a different search term."}
        </div>
      ) : (
        <div className="divide-y divide-[hsl(var(--border))]">
          {cases.map((testCase) => (
            <Link
              key={testCase.id}
              href={`/cases/${testCase.id}`}
              className="flex items-center justify-between p-4 hover:bg-[hsl(var(--muted))]"
            >
              <div className="min-w-0">
                <div className="font-medium truncate">{testCase.title}</div>
                <div className="text-sm text-[hsl(var(--muted-foreground))] flex items-center gap-2">
                  {testCase.folderName && <span>{testCase.folderName}</span>}
                  {testCase.updatedAt && (
                    <span>
                      Updated{" "}
                      {testCase.updatedAt.toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "px-2 py-0.5 text-xs font-medium rounded",
                    testCase.state === "active" &&
                      "bg-green-100 text-green-800",
                    testCase.state === "draft" &&
                      "bg-yellow-100 text-yellow-800",
                    testCase.state === "retired" &&
                      "bg-gray-100 text-gray-800",
                    testCase.state === "rejected" && "bg-red-100 text-red-800"
                  )}
                >
                  {testCase.state}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
