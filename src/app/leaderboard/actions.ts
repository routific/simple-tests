"use server";

import { db } from "@/lib/db";
import { userBadges } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSessionWithOrg } from "@/lib/auth";

export async function getCurrentUserBadges(): Promise<string[]> {
  const session = await getSessionWithOrg();
  if (!session) return [];

  const badges = await db
    .select({ badgeType: userBadges.badgeType })
    .from(userBadges)
    .where(
      and(
        eq(userBadges.userId, session.user.id),
        eq(userBadges.organizationId, session.user.organizationId)
      )
    );

  return badges.map((b) => b.badgeType);
}
