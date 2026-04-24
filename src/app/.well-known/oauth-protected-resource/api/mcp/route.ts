import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for the Streamable HTTP
 * MCP endpoint at /api/mcp. Mirrors the SSE metadata but with the resource
 * field pointing at the new endpoint so strict clients (e.g. Claude Desktop
 * custom connectors) accept it.
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const metadata = {
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [`${baseUrl}`],
    scopes_supported: ["mcp:read", "mcp:write", "mcp:admin"],
    bearer_methods_supported: ["header"],
    resource_documentation: `${baseUrl}/docs/mcp`,
  };

  return NextResponse.json(metadata, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
