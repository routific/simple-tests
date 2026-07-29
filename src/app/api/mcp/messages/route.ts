import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// The legacy HTTP+SSE transport is retired (see /api/mcp/sse). This endpoint
// only ever received messages for SSE sessions, so it has nothing to serve.
export async function POST(request: NextRequest) {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return NextResponse.json(
    {
      error:
        "The HTTP+SSE transport has been retired. Connect via Streamable HTTP at " +
        `${protocol}://${host}/api/mcp instead.`,
    },
    { status: 410, headers: corsHeaders }
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
