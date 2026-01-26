"use server";

import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getSessionWithOrg } from "@/lib/auth";
import { randomBytes, createHash } from "crypto";

interface CreateTokenInput {
  name: string;
  permissions: "read" | "write" | "admin";
  expiresInDays?: number;
}

export async function createApiToken(input: CreateTokenInput) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;
  const userId = session.user.id;

  try {
    // Generate token ID: st_ + 8 random hex bytes (16 chars)
    const tokenId = "st_" + randomBytes(8).toString("hex");

    // Generate secret: 32 random bytes, base64url encoded
    const secret = randomBytes(32)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    // Create the full token string
    const fullToken = `${tokenId}.${secret}`;

    // Hash the secret for storage
    const tokenHash = createHash("sha256").update(secret).digest("hex");

    // Calculate expiration date if provided
    const expiresAt = input.expiresInDays
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    await db.insert(apiTokens).values({
      id: tokenId,
      name: input.name,
      tokenHash,
      organizationId,
      userId,
      permissions: input.permissions,
      expiresAt,
    });

    revalidatePath("/settings/tokens");

    return { success: true, token: fullToken, tokenId };
  } catch (error) {
    console.error("Failed to create API token:", error);
    return { error: "Failed to create API token" };
  }
}

export async function revokeApiToken(tokenId: string) {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    // Verify the token belongs to the organization
    const token = await db
      .select()
      .from(apiTokens)
      .where(
        and(eq(apiTokens.id, tokenId), eq(apiTokens.organizationId, organizationId))
      )
      .get();

    if (!token) {
      return { error: "Token not found" };
    }

    // Soft delete by setting revokedAt
    await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(eq(apiTokens.id, tokenId));

    revalidatePath("/settings/tokens");

    return { success: true };
  } catch (error) {
    console.error("Failed to revoke API token:", error);
    return { error: "Failed to revoke API token" };
  }
}

export async function getApiTokens() {
  const session = await getSessionWithOrg();
  if (!session) {
    return { error: "Unauthorized" };
  }

  const { organizationId } = session.user;

  try {
    const tokens = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        permissions: apiTokens.permissions,
        expiresAt: apiTokens.expiresAt,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
        revokedAt: apiTokens.revokedAt,
        userId: apiTokens.userId,
      })
      .from(apiTokens)
      .where(eq(apiTokens.organizationId, organizationId));

    return { success: true, tokens };
  } catch (error) {
    console.error("Failed to fetch API tokens:", error);
    return { error: "Failed to fetch API tokens" };
  }
}
