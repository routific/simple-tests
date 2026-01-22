"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

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

  const getStateBadgeVariant = (state: string) => {
    switch (state) {
      case "active":
        return "success";
      case "draft":
        return "warning";
      case "retired":
        return "secondary";
      case "rejected":
        return "destructive";
      default:
        return "secondary";
    }
  };

  return (
    <div>
      {/* Search and Filter Bar */}
      <div className="p-4 border-b border-border flex gap-3 bg-muted/20">
        <div className="flex-1 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search test cases..."
            defaultValue={search}
            onChange={(e) => {
              const value = e.target.value;
              if (value.length === 0 || value.length >= 2) {
                updateSearch("q", value);
              }
            }}
            className="pl-9"
          />
        </div>
        <select
          value={stateFilter}
          onChange={(e) => updateSearch("state", e.target.value)}
          className="px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
        >
          <option value="">All states</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="retired">Retired</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Results */}
      {cases.length === 0 ? (
        <div className="p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <SearchIcon className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-medium text-foreground mb-1">No test cases found</p>
          <p className="text-sm text-muted-foreground">
            {search ? "Try a different search term." : "Create your first test case to get started."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {cases.map((testCase) => (
            <Link
              key={testCase.id}
              href={`/cases/${testCase.id}`}
              className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                  {testCase.title}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                  {testCase.folderName && (
                    <>
                      <FolderIcon className="w-3.5 h-3.5" />
                      <span>{testCase.folderName}</span>
                      <span className="text-border">·</span>
                    </>
                  )}
                  {testCase.updatedAt && (
                    <span>
                      Updated{" "}
                      {testCase.updatedAt.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <Badge variant={getStateBadgeVariant(testCase.state)}>
                  {testCase.state}
                </Badge>
                <ChevronRightIcon className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
