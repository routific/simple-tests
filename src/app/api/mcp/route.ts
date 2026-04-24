import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { validateAccessToken } from "@/lib/oauth/utils";
import { validateToken, extractBearerToken } from "@/lib/mcp/auth";
import type { AuthContext } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

// In-memory map of sessionId -> transport.
// Works for single-instance deployments; horizontal scaling would need
// sticky sessions or a distributed transport store.
const transports = new Map<string, WebStandardStreamableHTTPServerTransport>();

interface ResolvedAuth {
  userId: string;
  organizationId: string;
  clientId: string;
  scope: string | null;
}

async function resolveAuth(
  request: NextRequest
): Promise<{ auth: ResolvedAuth } | { errorResponse: Response }> {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const metadataUrl = `${baseUrl}/.well-known/oauth-protected-resource/api/mcp`;

  const token = extractBearerToken(request.headers.get("authorization"));

  if (!token) {
    return {
      errorResponse: new Response(
        JSON.stringify({ error: "Authorization required" }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}"`,
            ...corsHeaders,
          },
        }
      ),
    };
  }

  let auth = await validateAccessToken(token);

  if (!auth) {
    const apiAuth = await validateToken(token);
    if (apiAuth) {
      auth = {
        userId: apiAuth.userId,
        organizationId: apiAuth.organizationId,
        clientId: "api_token",
        scope:
          apiAuth.permissions === "admin"
            ? "mcp:admin"
            : apiAuth.permissions === "write"
            ? "mcp:write"
            : "mcp:read",
      };
    }
  }

  if (!auth) {
    return {
      errorResponse: new Response(
        JSON.stringify({ error: "Invalid or expired access token" }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": `Bearer error="invalid_token", resource_metadata="${metadataUrl}"`,
            ...corsHeaders,
          },
        }
      ),
    };
  }

  return { auth };
}

function parseScope(scope: string | null): "read" | "write" | "admin" {
  if (!scope) return "read";
  if (scope.includes("admin")) return "admin";
  if (scope.includes("write")) return "write";
  return "read";
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleMcpRequest(request: NextRequest): Promise<Response> {
  const result = await resolveAuth(request);
  if ("errorResponse" in result) return result.errorResponse;
  const { auth } = result;

  const sessionId = request.headers.get("mcp-session-id");
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    // Either an initialization request (no session id) or a request whose
    // session is no longer in memory. Create a fresh transport and let the
    // SDK either initialize it or reject with 404 so the client re-inits.
    const newTransport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, newTransport);
      },
      onsessionclosed: (sid) => {
        transports.delete(sid);
      },
    });

    const mcpAuth: AuthContext = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      token: null as any,
      organizationId: auth.organizationId,
      userId: auth.userId,
      permissions: parseScope(auth.scope),
    };

    const server = createMcpServer(mcpAuth, { clientId: auth.clientId });
    await server.connect(newTransport);
    transport = newTransport;
  }

  const response = await transport.handleRequest(request);
  return withCors(response);
}

export async function POST(request: NextRequest) {
  return handleMcpRequest(request);
}

export async function GET(request: NextRequest) {
  return handleMcpRequest(request);
}

export async function DELETE(request: NextRequest) {
  return handleMcpRequest(request);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
