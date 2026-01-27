import { NextRequest, NextResponse } from "next/server";
import { getSessionWithOrg } from "@/lib/auth";
import { createAuthorizationCode } from "@/lib/oauth/utils";

export const dynamic = "force-dynamic";

/**
 * OAuth 2.0 Authorization Endpoint
 *
 * This endpoint handles authorization requests from MCP clients.
 * If the user is already logged in via Linear, we issue an authorization code.
 * If not, we redirect to Linear login first.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  // Required OAuth parameters
  const responseType = searchParams.get("response_type");
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method") || "S256";

  // Optional parameters
  const state = searchParams.get("state");
  const scope = searchParams.get("scope");
  const resource = searchParams.get("resource"); // RFC 8707

  // Validate required parameters
  if (responseType !== "code") {
    return errorResponse(redirectUri, "unsupported_response_type", "Only 'code' response type is supported", state);
  }

  if (!clientId) {
    return errorResponse(redirectUri, "invalid_request", "client_id is required", state);
  }

  if (!redirectUri) {
    return errorResponse(null, "invalid_request", "redirect_uri is required", state);
  }

  if (!codeChallenge) {
    return errorResponse(redirectUri, "invalid_request", "code_challenge is required (PKCE)", state);
  }

  if (codeChallengeMethod !== "S256") {
    return errorResponse(redirectUri, "invalid_request", "Only S256 code_challenge_method is supported", state);
  }

  // Check if user is logged in
  const session = await getSessionWithOrg();

  if (!session) {
    // Store the OAuth request in a cookie and redirect to login
    const host = request.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    // Encode the original OAuth request parameters
    const oauthParams = new URLSearchParams({
      response_type: responseType,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      ...(state && { state }),
      ...(scope && { scope }),
      ...(resource && { resource }),
    });

    // Create a callback URL that will complete the OAuth flow after login
    const callbackUrl = `${baseUrl}/oauth/callback?${oauthParams.toString()}`;

    // Redirect to sign in with Linear, then back to our callback
    const signInUrl = new URL(`${baseUrl}/api/auth/signin/linear`);
    signInUrl.searchParams.set("callbackUrl", callbackUrl);

    return NextResponse.redirect(signInUrl);
  }

  // User is logged in, create authorization code
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

function errorResponse(
  redirectUri: string | null,
  error: string,
  description: string,
  state: string | null
): NextResponse {
  if (redirectUri) {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) {
      url.searchParams.set("state", state);
    }
    return NextResponse.redirect(url);
  }

  // No redirect URI, return JSON error
  return NextResponse.json(
    { error, error_description: description },
    { status: 400 }
  );
}
