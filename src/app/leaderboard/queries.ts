import { db } from "@/lib/db";
import {
  users,
  testCases,
  testRuns,
  testRunResults,
  testCaseAuditLog,
  testCaseLinearIssues,
  mcpWriteLog,
  userBadges,
} from "@/lib/db/schema";
import { count, eq, sql, and, isNotNull } from "drizzle-orm";

export type LeaderboardEntry = {
  userId: string;
  userName: string;
  userAvatar: string | null;
  count: number;
};

export type BadgeEntry = {
  userId: string;
  userName: string;
  userAvatar: string | null;
  badgeType: string;
  awardedAt: Date;
};

export type LeaderboardCategory = {
  key: string;
  label: string;
  description: string;
  icon: string;
  entries: LeaderboardEntry[];
};

// Most test cases created
async function getTestCasesCreated(organizationId: string): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: testCases.createdBy,
      userName: users.name,
      userAvatar: users.avatar,
      count: count(),
    })
    .from(testCases)
    .innerJoin(users, eq(testCases.createdBy, users.id))
    .where(and(eq(testCases.organizationId, organizationId), isNotNull(testCases.createdBy)))
    .groupBy(testCases.createdBy)
    .orderBy(sql`count(*) DESC`);

  return rows.map((r) => ({
    userId: r.userId!,
    userName: r.userName,
    userAvatar: r.userAvatar,
    count: r.count,
  }));
}

// Most scenarios executed (test results marked by user)
async function getScenariosExecuted(organizationId: string): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: testRunResults.executedBy,
      userName: users.name,
      userAvatar: users.avatar,
      count: count(),
    })
    .from(testRunResults)
    .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
    .innerJoin(users, eq(testRunResults.executedBy, users.id))
    .where(
      and(
        eq(testRuns.organizationId, organizationId),
        isNotNull(testRunResults.executedBy)
      )
    )
    .groupBy(testRunResults.executedBy)
    .orderBy(sql`count(*) DESC`);

  return rows.map((r) => ({
    userId: r.userId!,
    userName: r.userName,
    userAvatar: r.userAvatar,
    count: r.count,
  }));
}

// Most test case updates (keeping the house clean)
async function getTestCaseUpdates(organizationId: string): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: testCaseAuditLog.userId,
      userName: users.name,
      userAvatar: users.avatar,
      count: count(),
    })
    .from(testCaseAuditLog)
    .innerJoin(testCases, eq(testCaseAuditLog.testCaseId, testCases.id))
    .innerJoin(users, eq(testCaseAuditLog.userId, users.id))
    .where(
      and(
        eq(testCases.organizationId, organizationId),
        eq(testCaseAuditLog.action, "updated")
      )
    )
    .groupBy(testCaseAuditLog.userId)
    .orderBy(sql`count(*) DESC`);

  return rows.map((r) => ({
    userId: r.userId,
    userName: r.userName,
    userAvatar: r.userAvatar,
    count: r.count,
  }));
}

// Most test runs created
async function getTestRunsCreated(organizationId: string): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: testRuns.createdBy,
      userName: users.name,
      userAvatar: users.avatar,
      count: count(),
    })
    .from(testRuns)
    .innerJoin(users, eq(testRuns.createdBy, users.id))
    .where(and(eq(testRuns.organizationId, organizationId), isNotNull(testRuns.createdBy)))
    .groupBy(testRuns.createdBy)
    .orderBy(sql`count(*) DESC`);

  return rows.map((r) => ({
    userId: r.userId!,
    userName: r.userName,
    userAvatar: r.userAvatar,
    count: r.count,
  }));
}

// Bug Hunter - most failed tests found
async function getBugHunters(organizationId: string): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: testRunResults.executedBy,
      userName: users.name,
      userAvatar: users.avatar,
      count: count(),
    })
    .from(testRunResults)
    .innerJoin(testRuns, eq(testRunResults.testRunId, testRuns.id))
    .innerJoin(users, eq(testRunResults.executedBy, users.id))
    .where(
      and(
        eq(testRuns.organizationId, organizationId),
        eq(testRunResults.status, "failed"),
        isNotNull(testRunResults.executedBy)
      )
    )
    .groupBy(testRunResults.executedBy)
    .orderBy(sql`count(*) DESC`);

  return rows.map((r) => ({
    userId: r.userId!,
    userName: r.userName,
    userAvatar: r.userAvatar,
    count: r.count,
  }));
}

// Most Linear issue links
async function getLinearLinkers(organizationId: string): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: testCaseLinearIssues.linkedBy,
      userName: users.name,
      userAvatar: users.avatar,
      count: count(),
    })
    .from(testCaseLinearIssues)
    .innerJoin(testCases, eq(testCaseLinearIssues.testCaseId, testCases.id))
    .innerJoin(users, eq(testCaseLinearIssues.linkedBy, users.id))
    .where(
      and(
        eq(testCases.organizationId, organizationId),
        isNotNull(testCaseLinearIssues.linkedBy)
      )
    )
    .groupBy(testCaseLinearIssues.linkedBy)
    .orderBy(sql`count(*) DESC`);

  return rows.map((r) => ({
    userId: r.userId!,
    userName: r.userName,
    userAvatar: r.userAvatar,
    count: r.count,
  }));
}

// Top MCP users
async function getMcpUsers(organizationId: string): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: mcpWriteLog.userId,
      userName: users.name,
      userAvatar: users.avatar,
      count: count(),
    })
    .from(mcpWriteLog)
    .innerJoin(users, eq(mcpWriteLog.userId, users.id))
    .where(
      and(
        eq(mcpWriteLog.organizationId, organizationId),
        eq(mcpWriteLog.status, "success")
      )
    )
    .groupBy(mcpWriteLog.userId)
    .orderBy(sql`count(*) DESC`);

  return rows.map((r) => ({
    userId: r.userId,
    userName: r.userName,
    userAvatar: r.userAvatar,
    count: r.count,
  }));
}

// Get all badges for the org
async function getBadges(organizationId: string): Promise<BadgeEntry[]> {
  const rows = await db
    .select({
      userId: userBadges.userId,
      userName: users.name,
      userAvatar: users.avatar,
      badgeType: userBadges.badgeType,
      awardedAt: userBadges.awardedAt,
    })
    .from(userBadges)
    .innerJoin(users, eq(userBadges.userId, users.id))
    .where(eq(userBadges.organizationId, organizationId))
    .orderBy(sql`${userBadges.awardedAt} DESC`);

  return rows;
}

export async function getLeaderboardData(organizationId: string) {
  const [
    testCasesCreated,
    scenariosExecuted,
    testCaseUpdates,
    testRunsCreated,
    bugHunters,
    linearLinkers,
    mcpUsers,
    badges,
  ] = await Promise.all([
    getTestCasesCreated(organizationId),
    getScenariosExecuted(organizationId),
    getTestCaseUpdates(organizationId),
    getTestRunsCreated(organizationId),
    getBugHunters(organizationId),
    getLinearLinkers(organizationId),
    getMcpUsers(organizationId),
    getBadges(organizationId),
  ]);

  const categories: LeaderboardCategory[] = [
    {
      key: "scenarios_executed",
      label: "Scenarios Executed",
      description: "Most test scenarios run",
      icon: "play",
      entries: scenariosExecuted,
    },
    {
      key: "test_cases_created",
      label: "Test Cases Created",
      description: "Most test cases authored",
      icon: "clipboard",
      entries: testCasesCreated,
    },
    {
      key: "test_case_updates",
      label: "Housekeeper",
      description: "Most test case updates",
      icon: "sparkles",
      entries: testCaseUpdates,
    },
    {
      key: "test_runs_created",
      label: "Test Runs Started",
      description: "Most test runs kicked off",
      icon: "rocket",
      entries: testRunsCreated,
    },
    {
      key: "bug_hunters",
      label: "Bug Hunter",
      description: "Most failed tests caught",
      icon: "bug",
      entries: bugHunters,
    },
    {
      key: "mcp_users",
      label: "Top MCP User",
      description: "Most MCP operations",
      icon: "terminal",
      entries: mcpUsers,
    },
    {
      key: "linear_linkers",
      label: "Linker",
      description: "Most Linear issue links",
      icon: "link",
      entries: linearLinkers,
    },
  ];

  // Build "Achiever" category from badges - rank by badge count
  const badgeCountByUser = new Map<string, { userName: string; userAvatar: string | null; count: number }>();
  for (const badge of badges) {
    const existing = badgeCountByUser.get(badge.userId);
    if (existing) {
      existing.count++;
    } else {
      badgeCountByUser.set(badge.userId, {
        userName: badge.userName,
        userAvatar: badge.userAvatar,
        count: 1,
      });
    }
  }
  const achieverEntries: LeaderboardEntry[] = Array.from(badgeCountByUser.entries())
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.count - a.count);

  categories.push({
    key: "achiever",
    label: "Achiever",
    description: "Most achievements unlocked",
    icon: "trophy",
    entries: achieverEntries,
  });

  return { categories, badges };
}
