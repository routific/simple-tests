"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface TokenCreatedModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
}

export function TokenCreatedModal({ isOpen, onClose, token }: TokenCreatedModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Token Created"
      description="Your new API token has been created successfully"
    >
      <div className="p-6 space-y-4">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <WarningIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Copy this token now
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                You won&apos;t be able to see it again. Store it securely.
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Your API Token
          </label>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted rounded-lg px-3 py-2.5 text-sm font-mono break-all select-all">
              {token}
            </code>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <>
                  <CheckIcon className="w-4 h-4 mr-1.5" />
                  Copied
                </>
              ) : (
                <>
                  <CopyIcon className="w-4 h-4 mr-1.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Usage Example
          </label>
          <div className="bg-zinc-900 dark:bg-zinc-950 rounded-lg p-4 overflow-x-auto">
            <pre className="text-sm text-zinc-100 font-mono">
              <span className="text-zinc-500"># Set the token as an environment variable</span>
              {"\n"}
              <span className="text-green-400">export</span>{" "}
              <span className="text-blue-400">MCP_API_TOKEN</span>=
              <span className="text-amber-300">&quot;{token.slice(0, 20)}...&quot;</span>
              {"\n\n"}
              <span className="text-zinc-500"># Run the MCP server</span>
              {"\n"}
              <span className="text-green-400">cd</span> mcp-server && npm run dev -- --stdio
            </pre>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}

function WarningIcon({ className }: { className?: string }) {
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
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
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
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
