import { redirect } from "next/navigation";
import { getSessionWithOrg } from "@/lib/auth";
import { ConnectInstructions } from "./connect-instructions";

export default async function ConnectPage() {
  const session = await getSessionWithOrg();

  if (!session) {
    redirect("/signin");
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://simple-tests.routific.com";

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
    </div>
  );
}
