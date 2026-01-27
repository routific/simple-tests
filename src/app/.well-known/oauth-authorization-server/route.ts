import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 * This endpoint describes the OAuth capabilities of this server
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const metadata = {
    // Issuer identifier
    issuer: baseUrl,

    // Authorization endpoint
    authorization_endpoint: `${baseUrl}/oauth/authorize`,

    // Token endpoint
    token_endpoint: `${baseUrl}/oauth/token`,

    // Token revocation endpoint
    revocation_endpoint: `${baseUrl}/oauth/revoke`,

    // Registration endpoint for dynamic client registration
    registration_endpoint: `${baseUrl}/oauth/register`,

    // Supported response types
    response_types_supported: ["code"],

    // Supported grant types
    grant_types_supported: ["authorization_code", "refresh_token"],

    // Supported token endpoint auth methods
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],

    // Supported code challenge methods (PKCE)
    code_challenge_methods_supported: ["S256"],

    // Scopes supported
    scopes_supported: ["mcp:read", "mcp:write", "mcp:admin"],

    // We support resource indicators (RFC 8707)
    resource_indicators_supported: true,

    // Service documentation
    service_documentation: `${baseUrl}/docs/mcp`,
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
