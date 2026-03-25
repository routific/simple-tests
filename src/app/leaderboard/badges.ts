import { db } from "@/lib/db";
import {
  users,
  testCases,
  testRuns,
  testRunResults,
  testCaseAuditLog,
  testCaseLinearIssues,
  testResultHistory,
  releases,
  mcpWriteLog,
  userBadges,
} from "@/lib/db/schema";
import { count, eq, sql, and, isNotNull, ne } from "drizzle-orm";

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

  // Check architect: users who created 50+ test cases
  for (const row of testCaseCreators) {
    if (!row.userId) continue;
    const tcCount = await db
      .select({ count: count() })
      .from(testCases)
      .where(and(eq(testCases.organizationId, organizationId), eq(testCases.createdBy, row.userId)))
      .get();
    if (tcCount && tcCount.count >= 50 && !existingSet.has(`${row.userId}:architect`)) {
      newBadges.push({ userId: row.userId, badgeType: "architect" });
    }
  }

  // Check marathon_runner: users who created 25+ test runs
  for (const row of testRunCreators) {
    if (!row.userId) continue;
    const trCount = await db
      .select({ count: count() })
      .from(testRuns)
      .where(and(eq(testRuns.organizationId, organizationId), eq(testRuns.createdBy, row.userId)))
      .get();
    if (trCount && trCount.count >= 25 && !existingSet.has(`${row.userId}:marathon_runner`)) {
      newBadges.push({ userId: row.userId, badgeType: "marathon_runner" });
    }
  }

  // Check ship_it: users who created 10+ releases that are completed
  const shippers = await db
    .select({ userId: releases.createdBy, count: count() })
    .from(releases)
    .where(
      and(
        eq(releases.organizationId, organizationId),
        eq(releases.status, "completed"),
        isNotNull(releases.createdBy)
      )
    )
    .groupBy(releases.createdBy)
    .having(sql`count(*) >= 10`);

  for (const row of shippers) {
    if (row.userId && !existingSet.has(`${row.userId}:ship_it`)) {
      newBadges.push({ userId: row.userId, badgeType: "ship_it" });
    }
  }

  // Check night_owl: executed a test between midnight and 5am (hour 0-4)
  const nightOwls = await db
    .select({ userId: testRunResults.executedBy })
    .from(testRunResults)
    .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
    .where(
      and(
        eq(testRuns.organizationId, organizationId),
        isNotNull(testRunResults.executedBy),
        isNotNull(testRunResults.executedAt),
        sql`cast(strftime('%H', ${testRunResults.executedAt}, 'unixepoch') as integer) < 5`
      )
    )
    .groupBy(testRunResults.executedBy);

  for (const row of nightOwls) {
    if (row.userId && !existingSet.has(`${row.userId}:night_owl`)) {
      newBadges.push({ userId: row.userId, badgeType: "night_owl" });
    }
  }

  // Check early_bird: executed a test between 5am and 7am (hour 5-6)
  const earlyBirds = await db
    .select({ userId: testRunResults.executedBy })
    .from(testRunResults)
    .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
    .where(
      and(
        eq(testRuns.organizationId, organizationId),
        isNotNull(testRunResults.executedBy),
        isNotNull(testRunResults.executedAt),
        sql`cast(strftime('%H', ${testRunResults.executedAt}, 'unixepoch') as integer) >= 5`,
        sql`cast(strftime('%H', ${testRunResults.executedAt}, 'unixepoch') as integer) < 7`
      )
    )
    .groupBy(testRunResults.executedBy);

  for (const row of earlyBirds) {
    if (row.userId && !existingSet.has(`${row.userId}:early_bird`)) {
      newBadges.push({ userId: row.userId, badgeType: "early_bird" });
    }
  }

  // Check thorough: 30+ scenarios executed by a user in a single test run
  const thoroughUsers = await db
    .select({ userId: testRunResults.executedBy })
    .from(testRunResults)
    .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
    .where(
      and(
        eq(testRuns.organizationId, organizationId),
        isNotNull(testRunResults.executedBy)
      )
    )
    .groupBy(testRunResults.executedBy, testRunResults.testRunId)
    .having(sql`count(*) >= 30`);

  for (const row of thoroughUsers) {
    if (row.userId && !existingSet.has(`${row.userId}:thorough`)) {
      newBadges.push({ userId: row.userId, badgeType: "thorough" });
    }
  }

  // Check team_player: executed a scenario on a run someone else created
  const teamPlayers = await db
    .select({ userId: testRunResults.executedBy })
    .from(testRunResults)
    .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
    .where(
      and(
        eq(testRuns.organizationId, organizationId),
        isNotNull(testRunResults.executedBy),
        isNotNull(testRuns.createdBy),
        sql`${testRunResults.executedBy} != ${testRuns.createdBy}`
      )
    )
    .groupBy(testRunResults.executedBy);

  for (const row of teamPlayers) {
    if (row.userId && !existingSet.has(`${row.userId}:team_player`)) {
      newBadges.push({ userId: row.userId, badgeType: "team_player" });
    }
  }

  // Check connector: linked 25+ test cases to Linear issues
  const connectors = await db
    .select({ userId: testCaseLinearIssues.linkedBy, count: count() })
    .from(testCaseLinearIssues)
    .innerJoin(testCases, eq(testCaseLinearIssues.testCaseId, testCases.id))
    .where(
      and(
        eq(testCases.organizationId, organizationId),
        isNotNull(testCaseLinearIssues.linkedBy)
      )
    )
    .groupBy(testCaseLinearIssues.linkedBy)
    .having(sql`count(*) >= 25`);

  for (const row of connectors) {
    if (row.userId && !existingSet.has(`${row.userId}:connector`)) {
      newBadges.push({ userId: row.userId, badgeType: "connector" });
    }
  }

  // Check no_stone_unturned: zero skipped across 10+ distinct runs
  const allExecutors = await db
    .select({
      userId: testRunResults.executedBy,
      runCount: sql<number>`count(distinct ${testRunResults.testRunId})`,
      skippedCount: sql<number>`sum(case when ${testRunResults.status} = 'skipped' then 1 else 0 end)`,
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

  for (const row of allExecutors) {
    if (row.userId && row.runCount >= 10 && row.skippedCount === 0 && !existingSet.has(`${row.userId}:no_stone_unturned`)) {
      newBadges.push({ userId: row.userId, badgeType: "no_stone_unturned" });
    }
  }

  // Check speed_demon: completed a test run (all non-pending) in under 5 minutes
  const completedRuns = await db
    .select({
      runId: testRuns.id,
      createdAt: testRuns.createdAt,
      createdBy: testRuns.createdBy,
      pendingCount: sql<number>`sum(case when ${testRunResults.status} = 'pending' then 1 else 0 end)`,
      maxExecutedAt: sql<number>`max(${testRunResults.executedAt})`,
    })
    .from(testRuns)
    .innerJoin(testRunResults, eq(testRunResults.testRunId, testRuns.id))
    .where(eq(testRuns.organizationId, organizationId))
    .groupBy(testRuns.id);

  // Also get distinct executors per run for speed_demon attribution
  for (const run of completedRuns) {
    if (run.pendingCount > 0 || !run.maxExecutedAt || !run.createdAt) continue;
    const createdAtMs = run.createdAt.getTime();
    const maxExecMs = (run.maxExecutedAt as number) * 1000; // SQLite stores as unix seconds
    const diffMinutes = (maxExecMs - createdAtMs) / (1000 * 60);

    if (diffMinutes < 5 && diffMinutes >= 0) {
      // Find all executors of this run
      const executors = await db
        .select({ userId: testRunResults.executedBy })
        .from(testRunResults)
        .where(and(eq(testRunResults.testRunId, run.runId), isNotNull(testRunResults.executedBy)))
        .groupBy(testRunResults.executedBy);

      for (const exec of executors) {
        if (exec.userId && !existingSet.has(`${exec.userId}:speed_demon`)) {
          newBadges.push({ userId: exec.userId, badgeType: "speed_demon" });
          existingSet.add(`${exec.userId}:speed_demon`); // prevent duplicates from multiple fast runs
        }
      }
    }
  }

  // Check comeback_kid: a previously failed scenario that now passes
  // Look for testResultHistory with status='failed' where current testRunResult status='passed'
  const comebacks = await db
    .select({ userId: testRunResults.executedBy })
    .from(testRunResults)
    .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
    .innerJoin(testResultHistory, eq(testResultHistory.resultId, testRunResults.id))
    .where(
      and(
        eq(testRuns.organizationId, organizationId),
        eq(testRunResults.status, "passed"),
        eq(testResultHistory.status, "failed"),
        isNotNull(testRunResults.executedBy)
      )
    )
    .groupBy(testRunResults.executedBy);

  for (const row of comebacks) {
    if (row.userId && !existingSet.has(`${row.userId}:comeback_kid`)) {
      newBadges.push({ userId: row.userId, badgeType: "comeback_kid" });
    }
  }

  // Check completionist: earned every other badge type
  // Must be checked after all other badges are determined (including newly awarded ones)
  const allBadgeTypes = [
    "first_mcp_use", "first_test_case", "first_test_run", "century_club",
    "streak_master", "keyboard_hero", "pyrotechnician",
    "scenarios_250", "scenarios_500", "scenarios_1000",
    "architect", "marathon_runner", "ship_it",
    "night_owl", "early_bird", "thorough",
    "no_stone_unturned", "team_player", "connector",
    "speed_demon", "comeback_kid",
  ];

  // Build a combined set of existing + newly awarded badges per user
  const allUserBadges = new Map<string, Set<string>>();
  for (const b of existingBadges) {
    if (!allUserBadges.has(b.userId)) allUserBadges.set(b.userId, new Set());
    allUserBadges.get(b.userId)!.add(b.badgeType);
  }
  for (const b of newBadges) {
    if (!allUserBadges.has(b.userId)) allUserBadges.set(b.userId, new Set());
    allUserBadges.get(b.userId)!.add(b.badgeType);
  }

  const allUserBadgeEntries = Array.from(allUserBadges.entries());
  for (const [userId, badges] of allUserBadgeEntries) {
    if (existingSet.has(`${userId}:completionist`)) continue;
    // Already pushed as new badge?
    if (newBadges.some(b => b.userId === userId && b.badgeType === "completionist")) continue;

    const hasAll = allBadgeTypes.every(t => badges.has(t));
    if (hasAll) {
      newBadges.push({ userId, badgeType: "completionist" });
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
