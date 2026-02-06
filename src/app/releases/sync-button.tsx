"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { syncReleasesFromLinear } from "./actions";

export function SyncButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleSync() {
    setMessage(null);
    startTransition(async () => {
      const result = await syncReleasesFromLinear();
      if ("error" in result && result.error) {
        setMessage(result.error);
      } else if ("message" in result && result.message) {
        setMessage(result.message);
      } else {
        const parts: string[] = [];
        if (result.created) parts.push(`${result.created} created`);
        if (result.updated) parts.push(`${result.updated} updated`);
        setMessage(parts.length > 0 ? `Synced: ${parts.join(", ")}` : "Everything up to date");
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={handleSync} disabled={isPending} variant="outline" size="sm">
        <SyncIcon className={`w-4 h-4 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Syncing..." : "Sync from Linear"}
      </Button>
      {message && (
        <span className="text-sm text-muted-foreground">{message}</span>
      )}
    </div>
  );
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
      />
    </svg>
  );
}
