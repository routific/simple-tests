import { NextRequest, NextResponse } from "next/server";
import { validateAccessToken } from "@/lib/oauth/utils";
import { validateToken, extractBearerToken } from "@/lib/mcp/auth";
import { getSession } from "@/lib/mcp/session-store";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function POST(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  // Extract Bearer token from Authorization header
  const token = extractBearerToken(request.headers.get("authorization"));

  if (!token) {
    return NextResponse.json(
      { error: "Authorization required" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
          ...corsHeaders,
        },
      }
    );
  }

  // Try to validate as OAuth access token first
  let auth = await validateAccessToken(token);

  // Fall back to API token validation for backward compatibility
  if (!auth) {
    const apiAuth = await validateToken(token);
    if (apiAuth) {
      auth = {
        userId: apiAuth.userId,
        organizationId: apiAuth.organizationId,
        clientId: "api_token",
        scope: apiAuth.permissions === "admin" ? "mcp:admin" : apiAuth.permissions === "write" ? "mcp:write" : "mcp:read",
      };
    }
  }

  if (!auth) {
    return NextResponse.json(
      { error: "Invalid or expired access token" },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer error="invalid_token", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
          ...corsHeaders,
        },
      }
    );
  }

  // Get session ID from query params
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId query parameter required" },
      { status: 400, headers: corsHeaders }
    );
  }

  // Get session
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json(
      { error: "Session not found or expired" },
      { status: 404, headers: corsHeaders }
    );
  }

  // Verify token belongs to same org as session
  if (session.auth.organizationId !== auth.organizationId) {
    return NextResponse.json(
      { error: "Session organization mismatch" },
      { status: 403, headers: corsHeaders }
    );
  }

  // Parse message
  let message: JSONRPCMessage;
  try {
    message = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders }
    );
  }

  // Forward message to transport
  if (!session.transport) {
    return NextResponse.json(
      { error: "Session transport not ready" },
      { status: 503, headers: corsHeaders }
    );
  }

  try {
    session.transport.handleIncomingMessage(message);
    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[MCP Messages] Error handling message:", errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
