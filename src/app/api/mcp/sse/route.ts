import { NextRequest } from "next/server";
import { handleMcpRequest, corsHeaders } from "@/lib/mcp/streamable-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Legacy endpoint kept as an alias for connectors configured with the old
// /api/mcp/sse URL. The HTTP+SSE transport itself is retired: its long-lived
// GET stream exceeded Vercel's function duration limit, and its in-memory
// sessions broke across function instances, forcing clients into repeated
// reauth loops. Requests are served by the stateless Streamable HTTP handler
// instead; legacy SSE clients receive a clean 405 on GET rather than a
// stream that dies at the runtime timeout.

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
