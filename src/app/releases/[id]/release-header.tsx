"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completeRelease, reopenRelease, updateRelease, deleteRelease } from "../actions";

interface ReleaseHeaderProps {
  release: {
    id: number;
    name: string;
    status: "active" | "completed";
    linearLabelId: string | null;
  };
}

export function ReleaseHeader({ release }: ReleaseHeaderProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(release.name);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleComplete = () => {
    startTransition(async () => {
      await completeRelease(release.id);
      router.refresh();
    });
  };

  const handleReopen = () => {
    startTransition(async () => {
      await reopenRelease(release.id);
      router.refresh();
    });
  };

  const handleSave = () => {
    if (!editName.trim() || editName.trim() === release.name) {
      setIsEditing(false);
      setEditName(release.name);
      return;
    }

    startTransition(async () => {
      const result = await updateRelease(release.id, editName.trim());
      if (result.success) {
        setIsEditing(false);
        router.refresh();
      } else {
        setEditName(release.name);
        setIsEditing(false);
      }
    });
  };

  const handleDelete = () => {
    if (!confirm(`Delete "${release.name}"? Test runs will be moved to Unassigned.`)) return;

    startTransition(async () => {
      const result = await deleteRelease(release.id);
      if (result.success) {
        router.push("/releases");
      } else {
        alert(`Failed to delete: ${result.error}`);
      }
    });
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/releases/${release.id}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  return (
    <>
      {/* Back link */}
      <Link
        href="/releases"
        className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 inline-flex items-center gap-1"
      >
        <ChevronLeftIcon className="w-4 h-4" />
        All Releases
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-8 mt-2">
        <div className="flex items-center gap-3">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") {
                    setIsEditing(false);
                    setEditName(release.name);
                  }
                }}
                className="text-2xl font-semibold h-10 w-64"
                autoFocus
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSave}
                disabled={isPending}
                className="h-8 w-8 p-0"
              >
                <CheckIcon className="w-4 h-4 text-emerald-600" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false);
                  setEditName(release.name);
                }}
                className="h-8 w-8 p-0"
              >
                <CloseIcon className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                {release.name}
              </h1>
              <Badge variant={release.status === "active" ? "default" : "secondary"}>
                {release.status}
              </Badge>
              {release.linearLabelId && (
                <span className="text-xs text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded-full">
                  Synced from Linear
                </span>
              )}
            </>
          )}
        </div>

        {/* Action buttons */}
        {!isEditing && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopyLink}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Copy link to release"
            >
              {linkCopied ? (
                <CheckIcon className="w-4 h-4 text-emerald-600" />
              ) : (
                <LinkIcon className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Edit release"
            >
              <EditIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="p-2 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
              title="Delete release"
            >
              <TrashIcon className="w-4 h-4" />
            </button>
            {release.status === "active" ? (
              <Button
                onClick={handleComplete}
                disabled={isPending}
                className="ml-2"
              >
                <CheckIcon className="w-4 h-4" />
                {isPending ? "Completing..." : "Complete Release"}
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleReopen}
                disabled={isPending}
                className="ml-2"
              >
                <RefreshIcon className="w-4 h-4" />
                {isPending ? "Reopening..." : "Reopen"}
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
