import { db } from "@/lib/db";
import {
  users,
  testCases,
  testRuns,
  testRunResults,
  testCaseAuditLog,
  mcpWriteLog,
  userBadges,
} from "@/lib/db/schema";
import { count, eq, sql, and, isNotNull, inArray } from "drizzle-orm";

type BadgeType = typeof userBadges.$inferInsert["badgeType"];

export async function checkAndAwardBadges(organizationId: string) {
  // Fetch all existing badges for this org
  const existingBadges = await db
    .select({ userId: userBadges.userId, badgeType: userBadges.badgeType })
    .from(userBadges)
    .where(eq(userBadges.organizationId, organizationId));

  const existingSet = new Set(existingBadges.map((b) => `${b.userId}:${b.badgeType}`));

  const newBadges: { userId: string; badgeType: BadgeType }[] = [];

  // Check first_test_case: users who created at least 1 test case
  const testCaseCreators = await db
    .select({ userId: testCases.createdBy })
    .from(testCases)
    .where(and(eq(testCases.organizationId, organizationId), isNotNull(testCases.createdBy)))
    .groupBy(testCases.createdBy);

  for (const row of testCaseCreators) {
    if (row.userId && !existingSet.has(`${row.userId}:first_test_case`)) {
      newBadges.push({ userId: row.userId, badgeType: "first_test_case" });
    }
  }

  // Check first_test_run: users who created at least 1 test run
  const testRunCreators = await db
    .select({ userId: testRuns.createdBy })
    .from(testRuns)
    .where(and(eq(testRuns.organizationId, organizationId), isNotNull(testRuns.createdBy)))
    .groupBy(testRuns.createdBy);

  for (const row of testRunCreators) {
    if (row.userId && !existingSet.has(`${row.userId}:first_test_run`)) {
      newBadges.push({ userId: row.userId, badgeType: "first_test_run" });
    }
  }

  // Check first_mcp_use: users with at least 1 successful MCP write
  const mcpUsers = await db
    .select({ userId: mcpWriteLog.userId })
    .from(mcpWriteLog)
    .where(
      and(
        eq(mcpWriteLog.organizationId, organizationId),
        eq(mcpWriteLog.status, "success")
      )
    )
    .groupBy(mcpWriteLog.userId);

  for (const row of mcpUsers) {
    if (!existingSet.has(`${row.userId}:first_mcp_use`)) {
      newBadges.push({ userId: row.userId, badgeType: "first_mcp_use" });
    }
  }

  // Check century_club: users with 100+ test results executed
  const centurions = await db
    .select({
      userId: testRunResults.executedBy,
      count: count(),
    })
    .from(testRunResults)
    .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
    .where(
      and(
        eq(testRuns.organizationId, organizationId),
        isNotNull(testRunResults.executedBy)
      )
    )
    .groupBy(testRunResults.executedBy)
    .having(sql`count(*) >= 100`);

  for (const row of centurions) {
    if (row.userId && !existingSet.has(`${row.userId}:century_club`)) {
      newBadges.push({ userId: row.userId, badgeType: "century_club" });
    }
  }

  // Check scenario milestones: 250, 500, 1000
  const scenarioCounts = await db
    .select({
      userId: testRunResults.executedBy,
      count: count(),
    })
    .from(testRunResults)
    .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
    .where(
      and(
        eq(testRuns.organizationId, organizationId),
        isNotNull(testRunResults.executedBy)
      )
    )
    .groupBy(testRunResults.executedBy);

  const milestones: { threshold: number; badge: BadgeType }[] = [
    { threshold: 250, badge: "scenarios_250" },
    { threshold: 500, badge: "scenarios_500" },
    { threshold: 1000, badge: "scenarios_1000" },
  ];

  for (const row of scenarioCounts) {
    if (!row.userId) continue;
    for (const { threshold, badge } of milestones) {
      if (row.count >= threshold && !existingSet.has(`${row.userId}:${badge}`)) {
        newBadges.push({ userId: row.userId, badgeType: badge });
      }
    }
  }

  // Check streak_master: users with 7+ consecutive active days
  // Get all distinct activity dates per user from audit log and test results
  const auditDates = await db
    .select({
      userId: testCaseAuditLog.userId,
      day: sql<string>`date(${testCaseAuditLog.createdAt}, 'unixepoch')`.as("day"),
    })
    .from(testCaseAuditLog)
    .innerJoin(testCases, eq(testCaseAuditLog.testCaseId, testCases.id))
    .where(eq(testCases.organizationId, organizationId))
    .groupBy(testCaseAuditLog.userId, sql`date(${testCaseAuditLog.createdAt}, 'unixepoch')`);

  const executionDates = await db
    .select({
      userId: testRunResults.executedBy,
      day: sql<string>`date(${testRunResults.executedAt}, 'unixepoch')`.as("day"),
    })
    .from(testRunResults)
    .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
    .where(
      and(
        eq(testRuns.organizationId, organizationId),
        isNotNull(testRunResults.executedBy),
        isNotNull(testRunResults.executedAt)
      )
    )
    .groupBy(testRunResults.executedBy, sql`date(${testRunResults.executedAt}, 'unixepoch')`);

  // Merge dates per user
  const userDays = new Map<string, Set<string>>();
  for (const row of [...auditDates, ...executionDates]) {
    if (!row.userId || !row.day) continue;
    if (!userDays.has(row.userId)) userDays.set(row.userId, new Set());
    userDays.get(row.userId)!.add(row.day);
  }

  // Check for 7+ consecutive days
  const userDayEntries = Array.from(userDays.entries());
  for (const [userId, days] of userDayEntries) {
    if (existingSet.has(`${userId}:streak_master`)) continue;

    const sorted = Array.from(days).sort();
    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1] as string);
      const curr = new Date(sorted[i] as string);
      const diffMs = curr.getTime() - prev.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    if (maxStreak >= 7) {
      newBadges.push({ userId, badgeType: "streak_master" });
    }
  }

  // Insert all new badges
  if (newBadges.length > 0) {
    await db.insert(userBadges).values(
      newBadges.map((b) => ({
        userId: b.userId,
        organizationId,
        badgeType: b.badgeType,
      }))
    );
  }

  return newBadges;
}
