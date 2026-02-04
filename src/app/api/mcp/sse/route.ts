import { NextRequest, NextResponse } from "next/server";
import { createMcpServer } from "@/lib/mcp/server";
import { createSession, deleteSession, setSessionTransport, getSession, type McpTransport } from "@/lib/mcp/session-store";
import { validateAccessToken } from "@/lib/oauth/utils";
import { validateToken, extractBearerToken } from "@/lib/mcp/auth";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

/**
 * POST handler for Streamable HTTP transport
 * Some MCP clients POST messages directly to the SSE endpoint
 */
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

  // Get session ID from query params (or generate one)
  const sessionId = request.nextUrl.searchParams.get("sessionId") || crypto.randomUUID();

  // Create auth context for MCP server
  const mcpAuth = {
    token: null as any,
    organizationId: auth.organizationId,
    userId: auth.userId,
    permissions: parseScope(auth.scope) as "read" | "write" | "admin",
  };

  // Get or create session
  let session = getSession(sessionId);

  if (!session) {
    // Create a new session on-demand for Streamable HTTP transport
    const server = createMcpServer(mcpAuth, {
      clientId: auth.clientId,
      sessionId,
    });
    session = createSession(sessionId, server, mcpAuth);

    // For POST-only flow, create a simple transport that collects responses
    const postTransport: McpTransport = {
      async start() {},
      async send(message: JSONRPCMessage) {
        // Store response to send back
        (postTransport as any)._lastResponse = message;
      },
      async close() {},
      handleIncomingMessage(message: JSONRPCMessage) {
        this.onmessage?.(message);
      },
      onmessage: undefined,
      onclose: undefined,
      onerror: undefined,
    };
    setSessionTransport(sessionId, postTransport);

    // Connect server to transport
    await server.connect(postTransport as unknown as Transport);
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
    // Create a promise to capture the response
    const responsePromise = new Promise<JSONRPCMessage | null>((resolve) => {
      const transport = session.transport!;
      const originalSend = transport.send.bind(transport);

      // Intercept the next send call to capture the response
      transport.send = async (responseMessage: JSONRPCMessage) => {
        transport.send = originalSend; // Restore original
        resolve(responseMessage);
      };

      // Set a timeout in case no response comes
      setTimeout(() => resolve(null), 30000);
    });

    // Process the incoming message
    session.transport.handleIncomingMessage(message);

    // Wait for the response
    const response = await responsePromise;

    if (response) {
      return NextResponse.json(response, { headers: corsHeaders });
    } else {
      // No response expected (e.g., for notifications)
      return new Response(null, { status: 202, headers: corsHeaders });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[MCP SSE POST] Error handling message:", errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: corsHeaders }
    );
  }
}

function parseScope(scope: string | null): string {
  if (!scope) return "read";
  if (scope.includes("admin")) return "admin";
  if (scope.includes("write")) return "write";
  return "read";
}
