import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Test endpoint to check token status.
 * Only available in development.
 *
 * GET /api/debug/token-status
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  return NextResponse.json({
    hasAccessToken: !!session.accessToken,
    error: session.error || null,
    user: session.user?.name,
    tokenPreview: session.accessToken ? `${session.accessToken.slice(0, 10)}...` : null,
  });
}
