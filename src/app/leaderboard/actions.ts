"use server";

import { db } from "@/lib/db";
import {
  users,
  userBadges,
  testCases,
  testRuns,
  testRunResults,
  testCaseAuditLog,
  mcpWriteLog,
} from "@/lib/db/schema";
import { eq, and, sql, count, isNotNull } from "drizzle-orm";
import { getSessionWithOrg } from "@/lib/auth";

export type UserBadgeInfo = {
  badgeType: string;
};

export type UserMedalInfo = {
  medal: string;
  category: string;
};

const MEDALS = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"]; // 🥇🥈🥉

// Returns badges + medals for current user (used by sidebar)
export async function getCurrentUserBadgesAndMedals(): Promise<{
  badges: string[];
  medals: UserMedalInfo[];
}> {
  const session = await getSessionWithOrg();
  if (!session) return { badges: [], medals: [] };

  const userId = session.user.id;
  const orgId = session.user.organizationId;

  // Fetch badges
  const badgeRows = await db
    .select({ badgeType: userBadges.badgeType })
    .from(userBadges)
    .where(and(eq(userBadges.userId, userId), eq(userBadges.organizationId, orgId)));

  // Compute medals by checking top 3 placement in each ranking category
  const medals: UserMedalInfo[] = [];

  const rankingQueries = [
    {
      label: "Scenarios Executed",
      query: db
        .select({ userId: testRunResults.executedBy, count: count() })
        .from(testRunResults)
        .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
        .where(and(eq(testRuns.organizationId, orgId), isNotNull(testRunResults.executedBy)))
        .groupBy(testRunResults.executedBy)
        .orderBy(sql`count(*) DESC`)
        .limit(3),
    },
    {
      label: "Test Cases Created",
      query: db
        .select({ userId: testCases.createdBy, count: count() })
        .from(testCases)
        .where(and(eq(testCases.organizationId, orgId), isNotNull(testCases.createdBy)))
        .groupBy(testCases.createdBy)
        .orderBy(sql`count(*) DESC`)
        .limit(3),
    },
    {
      label: "Housekeeper",
      query: db
        .select({ userId: testCaseAuditLog.userId, count: count() })
        .from(testCaseAuditLog)
        .innerJoin(testCases, eq(testCaseAuditLog.testCaseId, testCases.id))
        .where(and(eq(testCases.organizationId, orgId), eq(testCaseAuditLog.action, "updated")))
        .groupBy(testCaseAuditLog.userId)
        .orderBy(sql`count(*) DESC`)
        .limit(3),
    },
    {
      label: "Test Runs Started",
      query: db
        .select({ userId: testRuns.createdBy, count: count() })
        .from(testRuns)
        .where(and(eq(testRuns.organizationId, orgId), isNotNull(testRuns.createdBy)))
        .groupBy(testRuns.createdBy)
        .orderBy(sql`count(*) DESC`)
        .limit(3),
    },
    {
      label: "Bug Hunter",
      query: db
        .select({ userId: testRunResults.executedBy, count: count() })
        .from(testRunResults)
        .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
        .where(
          and(
            eq(testRuns.organizationId, orgId),
            eq(testRunResults.status, "failed"),
            isNotNull(testRunResults.executedBy)
          )
        )
        .groupBy(testRunResults.executedBy)
        .orderBy(sql`count(*) DESC`)
        .limit(3),
    },
    {
      label: "Top MCP User",
      query: db
        .select({ userId: mcpWriteLog.userId, count: count() })
        .from(mcpWriteLog)
        .where(and(eq(mcpWriteLog.organizationId, orgId), eq(mcpWriteLog.status, "success")))
        .groupBy(mcpWriteLog.userId)
        .orderBy(sql`count(*) DESC`)
        .limit(3),
    },
  ];

  const results = await Promise.all(rankingQueries.map((r) => r.query));

  results.forEach((rows, catIdx) => {
    rows.forEach((row, placeIdx) => {
      if (row.userId === userId) {
        medals.push({
          medal: MEDALS[placeIdx],
          category: rankingQueries[catIdx].label,
        });
      }
    });
  });

  return {
    badges: badgeRows.map((b) => b.badgeType),
    medals,
  };
}

// Check for unseen badges and return them (marks them as seen)
export async function getAndMarkUnseenBadges(): Promise<string[]> {
  const session = await getSessionWithOrg();
  if (!session) return [];

  const unseen = await db
    .select({ id: userBadges.id, badgeType: userBadges.badgeType })
    .from(userBadges)
    .where(
      and(
        eq(userBadges.userId, session.user.id),
        eq(userBadges.organizationId, session.user.organizationId),
        eq(userBadges.seen, false)
      )
    );

  if (unseen.length > 0) {
    // Mark as seen
    for (const badge of unseen) {
      await db
        .update(userBadges)
        .set({ seen: true })
        .where(eq(userBadges.id, badge.id));
    }
  }

  return unseen.map((b) => b.badgeType);
}

// Award a specific badge directly (idempotent - skips if already awarded)
type BadgeType = typeof userBadges.$inferInsert["badgeType"];

export async function awardDirectBadge(badgeType: BadgeType): Promise<boolean> {
  const session = await getSessionWithOrg();
  if (!session) return false;

  const existing = await db
    .select({ id: userBadges.id })
    .from(userBadges)
    .where(
      and(
        eq(userBadges.userId, session.user.id),
        eq(userBadges.organizationId, session.user.organizationId),
        eq(userBadges.badgeType, badgeType)
      )
    )
    .get();

  if (existing) return false;

  await db.insert(userBadges).values({
    userId: session.user.id,
    organizationId: session.user.organizationId,
    badgeType,
  });

  return true;
}
