import { NextRequest } from "next/server";
import { createMcpServer } from "@/lib/mcp/server";
import { createSession, deleteSession, setSessionTransport, type McpTransport } from "@/lib/mcp/session-store";
import { validateAccessToken } from "@/lib/oauth/utils";
import { validateToken, extractBearerToken } from "@/lib/mcp/auth";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Custom transport for Next.js SSE
class NextJsSSETransport implements McpTransport {
  private encoder = new TextEncoder();
  private _writer: WritableStreamDefaultWriter<Uint8Array>;
  private _sessionId: string;
  private _closed = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(writer: WritableStreamDefaultWriter<Uint8Array>, sessionId: string) {
    this._writer = writer;
    this._sessionId = sessionId;
  }

  async start(): Promise<void> {
    // Send the endpoint event so clients know where to POST messages
    await this.sendSSE("endpoint", `/api/mcp/messages?sessionId=${this._sessionId}`);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this._closed) return;
    await this.sendSSE("message", JSON.stringify(message));
  }

  async close(): Promise<void> {
    this._closed = true;
    try {
      await this._writer.close();
    } catch {
      // Ignore close errors
    }
    this.onclose?.();
  }

  private async sendSSE(event: string, data: string): Promise<void> {
    if (this._closed) return;
    try {
      const sseMessage = `event: ${event}\ndata: ${data}\n\n`;
      await this._writer.write(this.encoder.encode(sseMessage));
    } catch (error) {
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // Called when a message is received via POST
  handleIncomingMessage(message: JSONRPCMessage): void {
    this.onmessage?.(message);
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  // Extract Bearer token from Authorization header
  const token = extractBearerToken(request.headers.get("authorization"));

  if (!token) {
    // Return 401 with WWW-Authenticate header per RFC 9728
    return new Response(JSON.stringify({ error: "Authorization required" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
        ...corsHeaders,
      },
    });
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
    return new Response(JSON.stringify({ error: "Invalid or expired access token" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer error="invalid_token", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
        ...corsHeaders,
      },
    });
  }

  // Create auth context for MCP server
  const mcpAuth = {
    token: null as any, // Not used for OAuth tokens
    organizationId: auth.organizationId,
    userId: auth.userId,
    permissions: parseScope(auth.scope) as "read" | "write" | "admin",
  };

  // Create session
  const sessionId = crypto.randomUUID();
  const server = createMcpServer(mcpAuth, {
    clientId: auth.clientId,
    sessionId,
  });

  // Create SSE stream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Create transport
  const transport = new NextJsSSETransport(writer, sessionId);

  // Store session with transport
  createSession(sessionId, server, mcpAuth);
  setSessionTransport(sessionId, transport);

  // Connect server to transport (cast to Transport for SDK compatibility)
  server.connect(transport as unknown as Transport).catch((error) => {
    console.error("[MCP SSE] Server connection error:", error);
  });

  // Clean up on close
  request.signal.addEventListener("abort", () => {
    deleteSession(sessionId);
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...corsHeaders,
    },
  });
}

function parseScope(scope: string | null): string {
  if (!scope) return "read";
  if (scope.includes("admin")) return "admin";
  if (scope.includes("write")) return "write";
  return "read";
}
