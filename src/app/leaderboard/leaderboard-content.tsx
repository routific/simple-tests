"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { LeaderboardCategory, LeaderboardEntry, BadgeEntry } from "./queries";

const CATEGORY_ICONS: Record<string, string> = {
  play: "\u25B6",
  clipboard: "\uD83D\uDCCB",
  sparkles: "\u2728",
  rocket: "\uD83D\uDE80",
  bug: "\uD83D\uDC1B",
  terminal: "\u2328\uFE0F",
  flag: "\uD83C\uDFC1",
  link: "\uD83D\uDD17",
  trophy: "\uD83C\uDFC6",
};

export const BADGE_CONFIG: Record<
  string,
  { label: string; icon: string; variant: "success" | "info" | "warning" | "default" | "destructive" | "secondary"; description: string }
> = {
  first_test_case: {
    label: "First Test Case",
    icon: "\uD83C\uDF31",
    variant: "success",
    description: "Created their first test case",
  },
  first_test_run: {
    label: "First Run",
    icon: "\uD83C\uDFC3",
    variant: "info",
    description: "Started their first test run",
  },
  first_mcp_use: {
    label: "MCP Pioneer",
    icon: "\uD83E\uDD16",
    variant: "default",
    description: "Used the MCP server for the first time",
  },
  century_club: {
    label: "Century Club",
    icon: "\uD83D\uDCAF",
    variant: "warning",
    description: "Executed 100+ test scenarios",
  },
  streak_master: {
    label: "Streak Master",
    icon: "\uD83D\uDD25",
    variant: "destructive",
    description: "7+ consecutive days of activity",
  },
  keyboard_hero: {
    label: "Keyboard Hero",
    icon: "\u2328\uFE0F",
    variant: "secondary",
    description: "Used a keyboard shortcut for the first time",
  },
  pyrotechnician: {
    label: "Pyrotechnician",
    icon: "\uD83C\uDF86",
    variant: "warning",
    description: "Launched fireworks with the ! shortcut",
  },
  scenarios_250: {
    label: "250 Club",
    icon: "\uD83C\uDF1F",
    variant: "info",
    description: "Executed 250 test scenarios",
  },
  scenarios_500: {
    label: "500 Club",
    icon: "\u2B50",
    variant: "warning",
    description: "Executed 500 test scenarios",
  },
  scenarios_1000: {
    label: "Legendary",
    icon: "\uD83C\uDF1F",
    variant: "destructive",
    description: "Executed 1,000 test scenarios",
  },
  architect: {
    label: "Architect",
    icon: "\uD83C\uDFD7\uFE0F",
    variant: "info",
    description: "Created 50 test cases",
  },
  marathon_runner: {
    label: "Marathon Runner",
    icon: "\uD83C\uDFC5",
    variant: "success",
    description: "Completed 25 test runs",
  },
  ship_it: {
    label: "Ship It",
    icon: "\uD83D\uDEA2",
    variant: "info",
    description: "10 releases completed",
  },
  night_owl: {
    label: "Night Owl",
    icon: "\uD83E\uDD89",
    variant: "default",
    description: "Executed a test between midnight and 5am",
  },
  early_bird: {
    label: "Early Bird",
    icon: "\uD83D\uDC26",
    variant: "success",
    description: "Executed a test before 7am",
  },
  bug_spotter: {
    label: "Bug Spotter",
    icon: "\uD83D\uDC1B",
    variant: "success",
    description: "Found 5 failed tests",
  },
  bug_catcher: {
    label: "Bug Catcher",
    icon: "\uD83E\uDD9F",
    variant: "warning",
    description: "Found 10 failed tests",
  },
  exterminator: {
    label: "Exterminator",
    icon: "\uD83D\uDEAB",
    variant: "destructive",
    description: "Found 20 failed tests",
  },
  thorough: {
    label: "Thorough",
    icon: "\uD83D\uDD0D",
    variant: "info",
    description: "Executed 30+ scenarios in a single test run",
  },
  super_thorough: {
    label: "Super Thorough",
    icon: "\uD83D\uDD2C",
    variant: "warning",
    description: "Executed 50+ scenarios in a single test run",
  },
  no_stone_unturned: {
    label: "No Stone Unturned",
    icon: "\uD83E\uDEA8",
    variant: "secondary",
    description: "Zero skipped scenarios across 10+ runs",
  },
  team_player: {
    label: "Team Player",
    icon: "\uD83E\uDD1D",
    variant: "success",
    description: "Executed scenarios on someone else's test run",
  },
  connector: {
    label: "Connector",
    icon: "\uD83D\uDD17",
    variant: "default",
    description: "Linked 25+ test cases to Linear issues",
  },
  speed_demon: {
    label: "Speed Demon",
    icon: "\u26A1",
    variant: "warning",
    description: "Completed a test run in under 5 minutes",
  },
  comeback_kid: {
    label: "Comeback Kid",
    icon: "\uD83D\uDD04",
    variant: "success",
    description: "Re-tested a failed scenario and it passed",
  },
  completionist: {
    label: "Completionist",
    icon: "\uD83C\uDFAF",
    variant: "destructive",
    description: "Earned every other achievement",
  },
};

function Avatar({
  name,
  avatar,
  size = "md",
}: {
  name: string;
  avatar: string | null;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizeClasses = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-14 h-14 text-lg",
    xl: "w-20 h-20 text-2xl",
  };

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        className={cn("rounded-full ring-2 ring-border object-cover", sizeClasses[size])}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full bg-brand-500/10 flex items-center justify-center ring-2 ring-border",
        sizeClasses[size]
      )}
    >
      <span className="font-medium text-brand-600 dark:text-brand-400">
        {name[0]?.toUpperCase() || "?"}
      </span>
    </div>
  );
}

function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <div className="text-4xl mb-3">{"\uD83C\uDFC6"}</div>
        <p className="font-medium text-foreground mb-1">No data yet</p>
        <p className="text-sm">Start using SimpleTests to see rankings here</p>
      </div>
    );
  }

  const podiumOrder = [entries[1], entries[0], entries[2]].filter(Boolean);
  const heights = ["h-28", "h-36", "h-24"];
  const medals = ["\uD83E\uDD48", "\uD83E\uDD47", "\uD83E\uDD49"]; // 🥈🥇🥉 (display order: 2nd, 1st, 3rd)
  const placeColors = [
    "from-zinc-300 to-zinc-400 dark:from-zinc-500 dark:to-zinc-600",
    "from-amber-400 to-yellow-500 dark:from-amber-500 dark:to-yellow-600",
    "from-amber-700 to-amber-800 dark:from-amber-700 dark:to-amber-800",
  ];
  const ringColors = [
    "ring-zinc-300 dark:ring-zinc-500",
    "ring-amber-400 dark:ring-amber-500",
    "ring-amber-700 dark:ring-amber-700",
  ];

  const displayEntries =
    entries.length === 1
      ? [{ entry: entries[0], podiumIdx: 1 }]
      : entries.length === 2
        ? [
            { entry: entries[1], podiumIdx: 0 },
            { entry: entries[0], podiumIdx: 1 },
          ]
        : podiumOrder.map((entry, idx) => ({ entry, podiumIdx: idx }));

  return (
    <div className="flex items-end justify-center gap-4 mb-8 pt-4">
      {displayEntries.map(({ entry, podiumIdx }) => (
        <div key={entry.userId} className="flex flex-col items-center gap-3 w-36">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className={cn("rounded-full", ringColors[podiumIdx])}>
                <Avatar
                  name={entry.userName}
                  avatar={entry.userAvatar}
                  size={podiumIdx === 1 ? "xl" : "lg"}
                />
              </div>
              <div className="absolute -bottom-1 -right-1 text-xl drop-shadow-md">
                {medals[podiumIdx]}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium text-foreground truncate max-w-[130px]">
                {entry.userName}
              </div>
              <div className="text-lg font-bold text-foreground tabular-nums">
                {entry.count.toLocaleString()}
              </div>
            </div>
          </div>
          <div
            className={cn(
              "w-full rounded-t-lg bg-gradient-to-t",
              placeColors[podiumIdx],
              heights[podiumIdx]
            )}
          />
        </div>
      ))}
    </div>
  );
}

function RankingsTable({ entries }: { entries: LeaderboardEntry[] }) {
  if (entries.length <= 3) return null;

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider w-16">
                Rank
              </th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                User
              </th>
              <th className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider text-right">
                Count
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.slice(3).map((entry, idx) => (
              <tr
                key={entry.userId}
                className="hover:bg-muted/50 transition-colors"
              >
                <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                  {idx + 4}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={entry.userName} avatar={entry.userAvatar} size="sm" />
                    <span className="text-sm font-medium text-foreground">
                      {entry.userName}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-foreground text-right tabular-nums">
                  {entry.count.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AchieverDetail({ badges }: { badges: BadgeEntry[] }) {
  if (badges.length === 0) return null;

  // Group badges by user, preserving the order from entries (sorted by count)
  const badgesByUser = new Map<
    string,
    { userName: string; userAvatar: string | null; badges: BadgeEntry[] }
  >();

  for (const badge of badges) {
    if (!badgesByUser.has(badge.userId)) {
      badgesByUser.set(badge.userId, {
        userName: badge.userName,
        userAvatar: badge.userAvatar,
        badges: [],
      });
    }
    badgesByUser.get(badge.userId)!.badges.push(badge);
  }

  // Sort by badge count descending
  const sorted = Array.from(badgesByUser.entries()).sort(
    (a, b) => b[1].badges.length - a[1].badges.length
  );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {sorted.map(([userId, user], idx) => (
            <div key={userId} className="flex items-start gap-4 px-4 py-4 hover:bg-muted/50 transition-colors">
              <div className="text-sm text-muted-foreground tabular-nums w-8 pt-0.5 shrink-0">
                {idx + 1}
              </div>
              <Avatar name={user.userName} avatar={user.userAvatar} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground mb-1.5">
                  {user.userName}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {user.badges.map((badge) => {
                    const config = BADGE_CONFIG[badge.badgeType];
                    if (!config) return null;
                    return (
                      <Badge
                        key={badge.badgeType}
                        variant={config.variant}
                        title={config.description}
                        className="gap-1"
                      >
                        <span>{config.icon}</span>
                        {config.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>
              <div className="text-sm font-semibold text-foreground tabular-nums shrink-0 pt-0.5">
                {user.badges.length}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function LeaderboardContent({
  categories,
  badges,
}: {
  categories: LeaderboardCategory[];
  badges: BadgeEntry[];
}) {
  const [activeCategory, setActiveCategory] = useState(0);
  const category = categories[activeCategory];

  return (
    <div className="space-y-6">
      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat, idx) => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(idx)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
              idx === activeCategory
                ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <span>{CATEGORY_ICONS[cat.icon] || ""}</span>
            {cat.label}
            {cat.entries.length > 0 && (
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full tabular-nums",
                  idx === activeCategory
                    ? "bg-brand-500/20 text-brand-600 dark:text-brand-400"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {cat.entries.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active Category Description */}
      <div className="text-sm text-muted-foreground">{category.description}</div>

      {/* Podium */}
      <Card>
        <CardContent className="p-6">
          <Podium entries={category.entries} />
        </CardContent>
      </Card>

      {/* Achiever tab: show badge details; other tabs: show rankings table */}
      {category.key === "achiever" ? (
        <AchieverDetail badges={badges} />
      ) : (
        <RankingsTable entries={category.entries} />
      )}
    </div>
  );
}
