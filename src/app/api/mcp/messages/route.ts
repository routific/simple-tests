import { NextRequest, NextResponse } from "next/server";
import { validateToken, extractBearerToken } from "@/lib/mcp/auth";
import { getSession } from "@/lib/mcp/session-store";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Extract and validate token
  const token = extractBearerToken(request.headers.get("authorization"));

  if (!token) {
    return NextResponse.json({ error: "Authorization header required" }, { status: 401 });
  }

  const auth = await validateToken(token);

  if (!auth) {
    return NextResponse.json({ error: "Invalid or expired API token" }, { status: 401 });
  }

  // Get session ID from query params
  const sessionId = request.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId query parameter required" }, { status: 400 });
  }

  // Get session
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found or expired" }, { status: 404 });
  }

  // Verify token belongs to same org as session
  if (session.auth.organizationId !== auth.organizationId) {
    return NextResponse.json({ error: "Session organization mismatch" }, { status: 403 });
  }

  // Parse message
  let message: JSONRPCMessage;
  try {
    message = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Forward message to transport
  if (!session.transport) {
    return NextResponse.json({ error: "Session transport not ready" }, { status: 503 });
  }

  try {
    session.transport.handleIncomingMessage(message);
    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[MCP Messages] Error handling message:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// Support OPTIONS for CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
