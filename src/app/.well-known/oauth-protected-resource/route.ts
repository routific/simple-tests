import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728)
 * This endpoint tells MCP clients where to find the authorization server
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const metadata = {
    // The resource identifier for this MCP server
    resource: `${baseUrl}/api/mcp/sse`,

    // Authorization servers that can issue tokens for this resource
    authorization_servers: [`${baseUrl}`],

    // Scopes supported by this resource
    scopes_supported: ["mcp:read", "mcp:write", "mcp:admin"],

    // Bearer token is the only supported method
    bearer_methods_supported: ["header"],

    // Resource documentation
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
