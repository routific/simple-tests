"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ConnectInstructionsProps {
  baseUrl: string;
}

export function ConnectInstructions({ baseUrl }: ConnectInstructionsProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const mcpUrl = `${baseUrl}/api/mcp/sse`;

  const copyToClipboard = async (text: string, section: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Overview Card */}
      <div className="bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 rounded-lg p-6">
        <div className="flex gap-4">
          <div className="shrink-0">
            <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center">
              <InfoIcon className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
          <div>
            <h3 className="font-medium text-brand-900 dark:text-brand-100 mb-1">
              What is MCP?
            </h3>
            <p className="text-sm text-brand-700 dark:text-brand-300">
              The Model Context Protocol (MCP) allows AI assistants like Claude to interact with SimpleTests directly.
              Once connected, your AI assistant can create, read, search, and manage test cases on your behalf.
            </p>
          </div>
        </div>
      </div>

      {/* Connection URL */}
      <div className="space-y-3">
        <h2 className="text-lg font-medium text-foreground">MCP Server URL</h2>
        <p className="text-sm text-muted-foreground">
          Use this URL to connect your MCP client to SimpleTests:
        </p>
        <div className="relative">
          <div className="bg-muted rounded-lg p-4 font-mono text-sm break-all">
            {mcpUrl}
          </div>
          <button
            onClick={() => copyToClipboard(mcpUrl, "url")}
            className="absolute top-2 right-2 p-2 rounded-md bg-background hover:bg-accent transition-colors"
            title="Copy URL"
          >
            {copiedSection === "url" ? (
              <CheckIcon className="w-4 h-4 text-green-500" />
            ) : (
              <CopyIcon className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Claude Code Instructions */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
          <TerminalIcon className="w-5 h-5" />
          Connect with Claude Code (CLI)
        </h2>
        <p className="text-sm text-muted-foreground">
          Run this command in your terminal:
        </p>
        <div className="relative">
          <div className="bg-slate-900 text-slate-100 rounded-lg p-4 font-mono text-sm">
            claude mcp add --transport sse simple-tests {mcpUrl}
          </div>
          <button
            onClick={() => copyToClipboard(`claude mcp add --transport sse simple-tests ${mcpUrl}`, "cli")}
            className="absolute top-2 right-2 p-2 rounded-md bg-slate-800 hover:bg-slate-700 transition-colors"
            title="Copy command"
          >
            {copiedSection === "cli" ? (
              <CheckIcon className="w-4 h-4 text-green-400" />
            ) : (
              <CopyIcon className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          When you first use the MCP server, Claude Code will open a browser for you to sign in with Linear.
        </p>
      </div>

      {/* Claude Desktop Instructions */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
          <ClaudeIcon className="w-5 h-5" />
          Connect with Claude Desktop
        </h2>

        <div className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="shrink-0">
              <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm font-medium">
                1
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground mb-2">Add the MCP Server</h3>
              <p className="text-sm text-muted-foreground mb-3">
                In Claude Desktop, go to <strong>Settings</strong> &rarr; <strong>Connections</strong> and click <strong>Add MCP Server</strong>.
                Paste the URL above when prompted.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="shrink-0">
              <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm font-medium">
                2
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground mb-2">Sign in with Linear</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Claude will open a browser window for you to sign in with your Linear account.
                This uses OAuth to securely authenticate without sharing passwords.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="shrink-0">
              <div className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm font-medium">
                3
              </div>
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-foreground mb-2">Start using SimpleTests</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Once connected, you can ask Claude to create test cases, search for existing tests,
                manage test runs, and more. Claude will use the MCP tools automatically.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Available Tools */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Available MCP Tools</h2>
        <p className="text-sm text-muted-foreground">
          Once connected, your AI assistant will have access to these tools:
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <ToolCard
            title="list_folders"
            description="List all folders in your organization"
            type="read"
          />
          <ToolCard
            title="get_folder"
            description="Get folder details with test cases"
            type="read"
          />
          <ToolCard
            title="list_test_cases"
            description="List test cases with filters"
            type="read"
          />
          <ToolCard
            title="get_test_case"
            description="Get test case with all scenarios"
            type="read"
          />
          <ToolCard
            title="search_test_cases"
            description="Search by title or content"
            type="read"
          />
          <ToolCard
            title="create_folder"
            description="Create a new folder"
            type="write"
          />
          <ToolCard
            title="create_test_case"
            description="Create a new test case"
            type="write"
          />
          <ToolCard
            title="update_test_case"
            description="Update an existing test case"
            type="write"
          />
          <ToolCard
            title="list_test_runs"
            description="List test runs with summaries"
            type="read"
          />
          <ToolCard
            title="get_test_run"
            description="Get test run with results"
            type="read"
          />
          <ToolCard
            title="create_test_run"
            description="Create a new test run"
            type="write"
          />
          <ToolCard
            title="update_test_result"
            description="Update test result status"
            type="write"
          />
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-muted/50 rounded-lg p-6 space-y-3">
        <h3 className="font-medium text-foreground">Need Help?</h3>
        <p className="text-sm text-muted-foreground">
          If you&apos;re having trouble connecting, make sure:
        </p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
          <li>You have a Linear account with access to your organization</li>
          <li>Claude Desktop is using the latest version</li>
          <li>You complete the OAuth sign-in when prompted</li>
        </ul>
      </div>
    </div>
  );
}

function ToolCard({
  title,
  description,
  type,
}: {
  title: string;
  description: string;
  type: "read" | "write";
}) {
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <code className="text-sm font-medium text-foreground">{title}</code>
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded",
            type === "read"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          )}
        >
          {type}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
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

function ClaudeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6zm4 4h-2v-2h2v2zm0-4h-2V7h2v6z" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}
