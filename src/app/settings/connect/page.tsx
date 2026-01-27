import { redirect } from "next/navigation";
import { getSessionWithOrg } from "@/lib/auth";
import { ConnectInstructions } from "./connect-instructions";
import { McpWriteLogs } from "./mcp-write-logs";
import { getLogsWithUsers } from "./actions";

export default async function ConnectPage() {
  const session = await getSessionWithOrg();

  if (!session) {
    redirect("/signin");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://simple-tests.routific.com";
  const logsResult = await getLogsWithUsers({ limit: 20 });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground mb-2">
          Connect via MCP
        </h1>
        <p className="text-muted-foreground">
          Connect your AI assistant to SimpleTests using the Model Context Protocol (MCP).
        </p>
      </div>

      <ConnectInstructions baseUrl={baseUrl} />

      {/* MCP Write Logs Section */}
      <div className="mt-12 pt-8 border-t border-border">
        <h2 className="text-lg font-medium text-foreground mb-2">
          MCP Activity Log
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Recent write operations performed via MCP. You can undo changes if needed.
        </p>
        <McpWriteLogs
          initialLogs={"error" in logsResult ? [] : logsResult.logs}
          total={"error" in logsResult ? 0 : logsResult.total}
        />
      </div>
    </div>
  );
}
