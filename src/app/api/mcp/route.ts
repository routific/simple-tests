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

// Stateless mode: each request gets a fresh transport + server. No session
// state is held between requests, which avoids "session not found" 400s
// on Vercel where requests can land on different function instances.
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
  const reqId = crypto.randomUUID().slice(0, 8);
  const sessionId = request.headers.get("mcp-session-id");

  // Peek at body without consuming the stream the SDK will read.
  let bodyPreview: string | undefined;
  if (request.method === "POST") {
    try {
      bodyPreview = await request.clone().text();
      if (bodyPreview.length > 1000) {
        bodyPreview = bodyPreview.slice(0, 1000) + "…";
      }
    } catch (err) {
      bodyPreview = `<<failed to read: ${err instanceof Error ? err.message : String(err)}>>`;
    }
  }

  console.log(
    `[MCP-DEBUG ${reqId}] in: ${request.method} ${request.nextUrl.pathname} ` +
      `accept=${JSON.stringify(request.headers.get("accept"))} ` +
      `content-type=${JSON.stringify(request.headers.get("content-type"))} ` +
      `mcp-session-id=${JSON.stringify(sessionId)} ` +
      `mcp-protocol-version=${JSON.stringify(request.headers.get("mcp-protocol-version"))} ` +
      `body=${bodyPreview ? JSON.stringify(bodyPreview) : "<<none>>"}`
  );

  const result = await resolveAuth(request);
  if ("errorResponse" in result) {
    console.log(`[MCP-DEBUG ${reqId}] auth-failed status=${result.errorResponse.status}`);
    return result.errorResponse;
  }
  const { auth } = result;

  // Stateless: fresh transport + server per request. sessionIdGenerator
  // undefined disables session validation in the SDK.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const mcpAuth: AuthContext = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    token: null as any,
    organizationId: auth.organizationId,
    userId: auth.userId,
    permissions: parseScope(auth.scope),
  };

  const server = createMcpServer(mcpAuth, { clientId: auth.clientId });
  await server.connect(transport);

  const response = await transport.handleRequest(request);

  // Clone the response so we can peek at the body for error responses
  // without consuming the stream we're about to return.
  if (response.status >= 400) {
    let errBody: string | undefined;
    try {
      errBody = await response.clone().text();
      if (errBody.length > 500) errBody = errBody.slice(0, 500) + "…";
    } catch {
      errBody = "<<unreadable>>";
    }
    console.log(
      `[MCP-DEBUG ${reqId}] sdk-error status=${response.status} ` +
        `mcp-session-id=${JSON.stringify(response.headers.get("mcp-session-id"))} ` +
        `body=${JSON.stringify(errBody)}`
    );
  } else {
    console.log(
      `[MCP-DEBUG ${reqId}] sdk-ok status=${response.status} ` +
        `mcp-session-id=${JSON.stringify(response.headers.get("mcp-session-id"))} ` +
        `content-type=${JSON.stringify(response.headers.get("content-type"))}`
    );
  }

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
