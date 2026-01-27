import { createHash, randomBytes } from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  oauthAuthorizationCodes,
  oauthAccessTokens,
  oauthRefreshTokens,
} from "@/lib/db/schema";

// Token expiration times
const AUTH_CODE_EXPIRY_SECONDS = 600; // 10 minutes
const ACCESS_TOKEN_EXPIRY_SECONDS = 3600; // 1 hour
const REFRESH_TOKEN_EXPIRY_SECONDS = 86400 * 30; // 30 days

/**
 * Generate a cryptographically secure random string
 */
export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString("base64url");
}

/**
 * Hash a token using SHA-256
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Verify PKCE code challenge
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string = "S256"
): boolean {
  if (method === "S256") {
    const hash = createHash("sha256").update(codeVerifier).digest("base64url");
    return hash === codeChallenge;
  }
  // Plain method (not recommended, but supported)
  return codeVerifier === codeChallenge;
}

/**
 * Create an authorization code
 */
export async function createAuthorizationCode(params: {
  clientId: string;
  userId: string;
  organizationId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  scope?: string;
}): Promise<string> {
  const code = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + AUTH_CODE_EXPIRY_SECONDS * 1000);

  await db.insert(oauthAuthorizationCodes).values({
    code,
    clientId: params.clientId,
    userId: params.userId,
    organizationId: params.organizationId,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod || "S256",
    scope: params.scope,
    expiresAt,
    createdAt: new Date(),
  });

  return code;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(params: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
} | null> {
  // Find the authorization code
  const authCode = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(
      and(
        eq(oauthAuthorizationCodes.code, params.code),
        eq(oauthAuthorizationCodes.clientId, params.clientId),
        gt(oauthAuthorizationCodes.expiresAt, new Date())
      )
    )
    .limit(1);

  if (authCode.length === 0) {
    return null;
  }

  const codeData = authCode[0];

  // Verify redirect URI matches
  if (codeData.redirectUri !== params.redirectUri) {
    return null;
  }

  // Verify PKCE
  if (
    !verifyCodeChallenge(
      params.codeVerifier,
      codeData.codeChallenge,
      codeData.codeChallengeMethod
    )
  ) {
    return null;
  }

  // Delete the used authorization code
  await db
    .delete(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.code, params.code));

  // Generate tokens
  const accessToken = generateSecureToken(32);
  const refreshToken = generateSecureToken(32);
  const accessTokenId = generateSecureToken(16);
  const refreshTokenId = generateSecureToken(16);

  const accessExpiresAt = new Date(
    Date.now() + ACCESS_TOKEN_EXPIRY_SECONDS * 1000
  );
  const refreshExpiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000
  );

  // Store access token
  await db.insert(oauthAccessTokens).values({
    id: accessTokenId,
    tokenHash: hashToken(accessToken),
    clientId: codeData.clientId,
    userId: codeData.userId,
    organizationId: codeData.organizationId,
    scope: codeData.scope,
    expiresAt: accessExpiresAt,
    createdAt: new Date(),
  });

  // Store refresh token
  await db.insert(oauthRefreshTokens).values({
    id: refreshTokenId,
    tokenHash: hashToken(refreshToken),
    accessTokenId: accessTokenId,
    expiresAt: refreshExpiresAt,
    createdAt: new Date(),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    tokenType: "Bearer",
    scope: codeData.scope || undefined,
  };
}

/**
 * Validate an access token
 */
export async function validateAccessToken(token: string): Promise<{
  userId: string;
  organizationId: string;
  clientId: string;
  scope: string | null;
} | null> {
  const tokenHash = hashToken(token);

  const result = await db
    .select()
    .from(oauthAccessTokens)
    .where(
      and(
        eq(oauthAccessTokens.tokenHash, tokenHash),
        gt(oauthAccessTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const tokenData = result[0];

  // Check if revoked
  if (tokenData.revokedAt) {
    return null;
  }

  return {
    userId: tokenData.userId,
    organizationId: tokenData.organizationId,
    clientId: tokenData.clientId,
    scope: tokenData.scope,
  };
}

/**
 * Refresh an access token
 */
export async function refreshAccessToken(params: {
  refreshToken: string;
  clientId: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  scope?: string;
} | null> {
  const tokenHash = hashToken(params.refreshToken);

  // Find the refresh token
  const refreshResult = await db
    .select({
      refresh: oauthRefreshTokens,
      access: oauthAccessTokens,
    })
    .from(oauthRefreshTokens)
    .innerJoin(
      oauthAccessTokens,
      eq(oauthRefreshTokens.accessTokenId, oauthAccessTokens.id)
    )
    .where(
      and(
        eq(oauthRefreshTokens.tokenHash, tokenHash),
        gt(oauthRefreshTokens.expiresAt, new Date())
      )
    )
    .limit(1);

  if (refreshResult.length === 0) {
    return null;
  }

  const { refresh, access } = refreshResult[0];

  // Verify client ID
  if (access.clientId !== params.clientId) {
    return null;
  }

  // Check if revoked
  if (refresh.revokedAt || access.revokedAt) {
    return null;
  }

  // Revoke the old tokens
  await db
    .update(oauthRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthRefreshTokens.id, refresh.id));

  await db
    .update(oauthAccessTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthAccessTokens.id, access.id));

  // Generate new tokens
  const newAccessToken = generateSecureToken(32);
  const newRefreshToken = generateSecureToken(32);
  const accessTokenId = generateSecureToken(16);
  const refreshTokenId = generateSecureToken(16);

  const accessExpiresAt = new Date(
    Date.now() + ACCESS_TOKEN_EXPIRY_SECONDS * 1000
  );
  const refreshExpiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000
  );

  // Store new access token
  await db.insert(oauthAccessTokens).values({
    id: accessTokenId,
    tokenHash: hashToken(newAccessToken),
    clientId: access.clientId,
    userId: access.userId,
    organizationId: access.organizationId,
    scope: access.scope,
    expiresAt: accessExpiresAt,
    createdAt: new Date(),
  });

  // Store new refresh token
  await db.insert(oauthRefreshTokens).values({
    id: refreshTokenId,
    tokenHash: hashToken(newRefreshToken),
    accessTokenId: accessTokenId,
    expiresAt: refreshExpiresAt,
    createdAt: new Date(),
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
    tokenType: "Bearer",
    scope: access.scope || undefined,
  };
}
