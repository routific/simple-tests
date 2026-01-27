import { NextRequest, NextResponse } from "next/server";
import { getSessionWithOrg } from "@/lib/auth";
import { createAuthorizationCode } from "@/lib/oauth/utils";

export const dynamic = "force-dynamic";

/**
 * OAuth Callback Endpoint
 *
 * This endpoint is called after the user logs in via Linear.
 * It completes the OAuth authorization flow by creating an authorization code.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Get OAuth parameters (passed through from /oauth/authorize)
  const responseType = searchParams.get("response_type");
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method") || "S256";
  const state = searchParams.get("state");
  const scope = searchParams.get("scope");

  // Validate required parameters
  if (!clientId || !redirectUri || !codeChallenge) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing required OAuth parameters" },
      { status: 400 }
    );
  }

  // Check if user is logged in (they should be after Linear login)
  const session = await getSessionWithOrg();

  if (!session) {
    return NextResponse.json(
      { error: "access_denied", error_description: "User authentication failed" },
      { status: 401 }
    );
  }

  // Create authorization code
  const code = await createAuthorizationCode({
    clientId,
    userId: session.user.id,
    organizationId: session.user.organizationId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope: scope || undefined,
  });

  // Redirect back to client with authorization code
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  return NextResponse.redirect(redirectUrl);
}
