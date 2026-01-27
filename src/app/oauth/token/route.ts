import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, refreshAccessToken } from "@/lib/oauth/utils";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * OAuth 2.0 Token Endpoint
 *
 * This endpoint exchanges authorization codes for access tokens,
 * and handles refresh token requests.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, string>;

  // Parse body - support both JSON and form-urlencoded
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      body = await request.json();
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text();
      body = Object.fromEntries(new URLSearchParams(text).entries());
    } else {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries()) as Record<string, string>;
    }
  } catch (error) {
    console.error("[OAuth Token] Error parsing request body:", error);
    return errorResponse("invalid_request", "Failed to parse request body");
  }

  console.log("[OAuth Token] Request body:", JSON.stringify(body));

  const grantType = body.grant_type;
  const clientId = body.client_id;

  if (!grantType) {
    return errorResponse("invalid_request", "grant_type is required");
  }

  if (!clientId) {
    return errorResponse("invalid_request", "client_id is required");
  }

  if (grantType === "authorization_code") {
    return handleAuthorizationCodeGrant(body, clientId);
  }

  if (grantType === "refresh_token") {
    return handleRefreshTokenGrant(body, clientId);
  }

  return errorResponse("unsupported_grant_type", `Grant type '${grantType}' is not supported`);
}

async function handleAuthorizationCodeGrant(
  body: Record<string, string>,
  clientId: string
): Promise<NextResponse> {
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const codeVerifier = body.code_verifier;

  console.log("[OAuth Token] Authorization code grant - code:", code ? "present" : "missing", "redirectUri:", redirectUri, "codeVerifier:", codeVerifier ? "present" : "missing");

  if (!code) {
    return errorResponse("invalid_request", "code is required");
  }

  if (!redirectUri) {
    return errorResponse("invalid_request", "redirect_uri is required");
  }

  if (!codeVerifier) {
    return errorResponse("invalid_request", "code_verifier is required (PKCE)");
  }

  const tokens = await exchangeCodeForTokens({
    code,
    clientId,
    redirectUri,
    codeVerifier,
  });

  if (!tokens) {
    return errorResponse("invalid_grant", "Invalid authorization code, redirect_uri, or code_verifier");
  }

  return NextResponse.json(
    {
      access_token: tokens.accessToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      ...(tokens.scope && { scope: tokens.scope }),
    },
    { headers: corsHeaders }
  );
}

async function handleRefreshTokenGrant(
  body: Record<string, string>,
  clientId: string
): Promise<NextResponse> {
  const refreshToken = body.refresh_token;

  if (!refreshToken) {
    return errorResponse("invalid_request", "refresh_token is required");
  }

  const tokens = await refreshAccessToken({
    refreshToken,
    clientId,
  });

  if (!tokens) {
    return errorResponse("invalid_grant", "Invalid or expired refresh token");
  }

  return NextResponse.json(
    {
      access_token: tokens.accessToken,
      token_type: tokens.tokenType,
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      ...(tokens.scope && { scope: tokens.scope }),
    },
    { headers: corsHeaders }
  );
}

function errorResponse(error: string, description: string): NextResponse {
  return NextResponse.json(
    { error, error_description: description },
    { status: 400, headers: corsHeaders }
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
