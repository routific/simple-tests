import { createHash } from "crypto";
import { eq, and, isNull, or, gt } from "drizzle-orm";
import { db, apiTokens, type ApiToken } from "../shared/index.js";

export interface AuthContext {
  token: ApiToken;
  organizationId: string;
  userId: string;
  permissions: "read" | "write" | "admin";
}

/**
 * Hash a token using SHA-256
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Validate an API token and return the auth context
 */
export async function validateToken(token: string): Promise<AuthContext | null> {
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);

  const result = await db
    .select()
    .from(apiTokens)
    .where(
      and(
        eq(apiTokens.tokenHash, tokenHash),
        isNull(apiTokens.revokedAt),
        or(
          isNull(apiTokens.expiresAt),
          gt(apiTokens.expiresAt, new Date())
        )
      )
    )
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const apiToken = result[0];

  // Update last used timestamp
  await db
    .update(apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiTokens.id, apiToken.id));

  return {
    token: apiToken,
    organizationId: apiToken.organizationId,
    userId: apiToken.userId,
    permissions: apiToken.permissions as "read" | "write" | "admin",
  };
}

/**
 * Check if the auth context has the required permission level
 */
export function hasPermission(
  auth: AuthContext,
  required: "read" | "write" | "admin"
): boolean {
  const levels = { read: 1, write: 2, admin: 3 };
  return levels[auth.permissions] >= levels[required];
}

/**
 * Get token from environment variable (for STDIO mode)
 */
export function getTokenFromEnv(): string | null {
  return process.env.MCP_API_TOKEN || null;
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
