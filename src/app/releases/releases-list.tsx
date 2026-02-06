"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReleaseStatusButton } from "./release-status-button";

export interface ReleaseData {
  id: number;
  name: string;
  status: "active" | "completed";
  linearLabelId: string | null;
  runCount: number;
  issueCount: number | null;
}

interface ReleasesListProps {
  releases: ReleaseData[];
}

export function ReleasesList({ releases }: ReleasesListProps) {
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [searchQuery, setSearchQuery] = useState("");

  const activeReleases = releases.filter((r) => r.status === "active");
  const completedReleases = releases.filter((r) => r.status === "completed");

  const filteredCompletedReleases = searchQuery
    ? completedReleases.filter((r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : completedReleases;

  const currentReleases =
    activeTab === "active" ? activeReleases : filteredCompletedReleases;

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-muted rounded-lg w-fit">
        <button
          onClick={() => setActiveTab("active")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "active"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Active
          <Badge variant="secondary" className="ml-2">
            {activeReleases.length}
          </Badge>
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
            activeTab === "completed"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Completed
          <Badge variant="secondary" className="ml-2">
            {completedReleases.length}
          </Badge>
        </button>
      </div>

      {/* Content */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium">
              {activeTab === "active" ? "Active Releases" : "Completed Releases"}
            </CardTitle>
            {activeTab === "completed" && (
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search releases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 w-48"
                />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 mt-4">
          {currentReleases.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              No {activeTab} releases
            </div>
          ) : (
            <div className="divide-y divide-border">
              {currentReleases.map((release) => (
                <Link key={release.id} href={`/releases/${release.id}`}>
                  <div className="flex items-center justify-between px-6 py-4 hover:bg-muted/50 transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <TagIcon className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium text-foreground">
                          {release.name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {release.runCount} test run
                          {release.runCount !== 1 ? "s" : ""}
                          {release.issueCount !== null && (
                            <span className="ml-2">
                              &middot; {release.issueCount} issue
                              {release.issueCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {release.linearLabelId && (
                            <span className="ml-2 text-xs text-brand-500">
                              Synced from Linear
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ReleaseStatusButton
                        releaseId={release.id}
                        status={release.status}
                      />
                      <Badge
                        variant={
                          release.status === "active" ? "default" : "secondary"
                        }
                      >
                        {release.status}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 6h.008v.008H6V6z"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
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
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}
