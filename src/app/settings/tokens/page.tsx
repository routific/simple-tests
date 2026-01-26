import { redirect } from "next/navigation";
import { getSessionWithOrg } from "@/lib/auth";
import { getApiTokens } from "./actions";
import { TokenList } from "./token-list";

export default async function TokensPage() {
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/signin");
  }

  const result = await getApiTokens();

  if ("error" in result) {
    return (
      <div className="p-8">
        <p className="text-destructive">Error: {result.error}</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">API Tokens</h1>
        <p className="text-muted-foreground mt-1">
          Manage API tokens for MCP server authentication
        </p>
      </div>

      <TokenList tokens={result.tokens} />
    </div>
  );
}
