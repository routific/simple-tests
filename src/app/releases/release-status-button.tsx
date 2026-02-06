"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { completeRelease, reopenRelease } from "./actions";

interface ReleaseStatusButtonProps {
  releaseId: number;
  status: "active" | "completed";
  size?: "sm" | "md" | "lg";
}

export function ReleaseStatusButton({
  releaseId,
  status,
  size = "sm",
}: ReleaseStatusButtonProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      if (status === "active") {
        await completeRelease(releaseId);
      } else {
        await reopenRelease(releaseId);
      }
      router.refresh();
    });
  }

  return (
    <Button
      size={size}
      variant="outline"
      onClick={handleClick}
      disabled={isPending}
      className="h-7 text-xs"
    >
      {status === "active" ? (
        <>
          <CheckIcon className="w-3 h-3 mr-1" />
          {isPending ? "Completing..." : "Complete"}
        </>
      ) : (
        <>
          <RefreshIcon className="w-3 h-3 mr-1" />
          {isPending ? "Reopening..." : "Reopen"}
        </>
      )}
    </Button>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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
