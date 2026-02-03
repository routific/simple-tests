import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// In-memory store for dynamically registered clients
// In production, this should be stored in a database
const registeredClients = new Map<string, {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  tokenEndpointAuthMethod: string;
  createdAt: Date;
}>();

/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591)
 *
 * This endpoint allows MCP clients to register automatically
 * without manual configuration.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", "Invalid JSON body");
  }

  // Extract registration metadata
  const clientName = body.client_name as string || "MCP Client";
  const redirectUris = body.redirect_uris as string[];
  const grantTypes = body.grant_types as string[] || ["authorization_code", "refresh_token"];
  const responseTypes = body.response_types as string[] || ["code"];
  const tokenEndpointAuthMethod = body.token_endpoint_auth_method as string || "none";

  // Validate redirect URIs
  if (!redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
    return errorResponse("invalid_redirect_uri", "At least one redirect_uri is required");
  }

  // Validate each redirect URI
  for (const uri of redirectUris) {
    try {
      const url = new URL(uri);
      // Allow:
      // - localhost/127.0.0.1 (any protocol, for development)
      // - HTTPS URLs (for web apps)
      // - Custom protocol schemes (for native apps like Cursor, VS Code, etc.)
      const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      const isHttps = url.protocol === "https:";
      const isCustomScheme = !url.protocol.startsWith("http");

      if (!isLocalhost && !isHttps && !isCustomScheme) {
        return errorResponse(
          "invalid_redirect_uri",
          `redirect_uri must use HTTPS, localhost, or a custom protocol scheme: ${uri}`
        );
      }
    } catch {
      return errorResponse("invalid_redirect_uri", `Invalid redirect_uri: ${uri}`);
    }
  }

  // Validate grant types
  const allowedGrantTypes = ["authorization_code", "refresh_token"];
  for (const grantType of grantTypes) {
    if (!allowedGrantTypes.includes(grantType)) {
      return errorResponse("invalid_client_metadata", `Unsupported grant_type: ${grantType}`);
    }
  }

  // Validate response types
  const allowedResponseTypes = ["code"];
  for (const responseType of responseTypes) {
    if (!allowedResponseTypes.includes(responseType)) {
      return errorResponse("invalid_client_metadata", `Unsupported response_type: ${responseType}`);
    }
  }

  // Generate client ID
  const clientId = `mcp_${randomBytes(16).toString("hex")}`;

  // Store the client registration
  registeredClients.set(clientId, {
    clientId,
    clientName,
    redirectUris,
    grantTypes,
    responseTypes,
    tokenEndpointAuthMethod,
    createdAt: new Date(),
  });

  // Return client registration response
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  return NextResponse.json(
    {
      client_id: clientId,
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: tokenEndpointAuthMethod,
      registration_client_uri: `${baseUrl}/oauth/register/${clientId}`,
    },
    { status: 201, headers: corsHeaders }
  );
}

function errorResponse(error: string, description: string): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status: 400, headers: corsHeaders }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

