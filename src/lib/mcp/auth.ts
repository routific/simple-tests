import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiTokens, type ApiToken } from "@/lib/db/schema";

export interface AuthContext {
  token: ApiToken;
  organizationId: string;
  userId: string;
  permissions: "read" | "write" | "admin";
}

/**
 * Hash a secret using SHA-256
 */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Parse a token string into its components
 * Token format: st_<id>.<secret>
 */
export function parseToken(token: string): { id: string; secret: string } | null {
  if (!token) {
    return null;
  }

  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) {
    return null;
  }

  const id = token.slice(0, dotIndex);
  const secret = token.slice(dotIndex + 1);

  if (!id.startsWith("st_") || !secret) {
    return null;
  }

  return { id, secret };
}

/**
 * Validate an API token and return the auth context
 */
export async function validateToken(token: string): Promise<AuthContext | null> {
  const parsed = parseToken(token);
  if (!parsed) {
    return null;
  }

  const { id, secret } = parsed;
  const secretHash = hashSecret(secret);

  // Look up by token ID (primary key) for efficiency
  const result = await db
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.id, id))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const apiToken = result[0];

  // Verify the secret hash matches
  if (apiToken.tokenHash !== secretHash) {
    return null;
  }

  // Check if revoked
  if (apiToken.revokedAt) {
    return null;
  }

  // Check if expired
  if (apiToken.expiresAt && apiToken.expiresAt < new Date()) {
    return null;
  }

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
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader: string | null | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
