"use client";

import { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
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
};

export const BADGE_CONFIG: Record<
  string,
  { label: string; icon: string; variant: "success" | "info" | "warning" | "default" | "destructive"; description: string }
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
};

const MEDALS = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"]; // 🥇🥈🥉

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

// Compute which medals each user has across all categories
function computeUserMedals(categories: LeaderboardCategory[]): Map<string, { medal: string; category: string }[]> {
  const medals = new Map<string, { medal: string; category: string }[]>();

  for (const cat of categories) {
    for (let i = 0; i < Math.min(3, cat.entries.length); i++) {
      const entry = cat.entries[i];
      if (!medals.has(entry.userId)) medals.set(entry.userId, []);
      medals.get(entry.userId)!.push({
        medal: MEDALS[i],
        category: cat.label,
      });
    }
  }

  return medals;
}

function Podium({
  entries,
  userMedals,
}: {
  entries: LeaderboardEntry[];
  userMedals: Map<string, { medal: string; category: string }[]>;
}) {
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
  const podiumMedals = ["\uD83E\uDD48", "\uD83E\uDD47", "\uD83E\uDD49"]; // 🥈🥇🥉 (podium display order: 2nd, 1st, 3rd)
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
      {displayEntries.map(({ entry, podiumIdx }) => {
        const allMedals = userMedals.get(entry.userId) || [];
        return (
          <div key={entry.userId} className="flex flex-col items-center gap-3 w-40">
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
                  {podiumMedals[podiumIdx]}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-foreground truncate max-w-[150px]">
                  {entry.userName}
                </div>
                <div className="text-lg font-bold text-foreground tabular-nums">
                  {entry.count.toLocaleString()}
                </div>
              </div>
              {/* All medals this user has across categories */}
              {allMedals.length > 0 && (
                <div className="flex flex-wrap justify-center gap-0.5">
                  {allMedals.map((m, i) => (
                    <span
                      key={i}
                      title={`${m.medal} ${m.category}`}
                      className="text-sm cursor-default leading-none"
                    >
                      {m.medal}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div
              className={cn(
                "w-full rounded-t-lg bg-gradient-to-t",
                placeColors[podiumIdx],
                heights[podiumIdx]
              )}
            />
          </div>
        );
      })}
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

function BadgesSection({ badges }: { badges: BadgeEntry[] }) {
  if (badges.length === 0) return null;

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

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">Achievements</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-4">
          {Array.from(badgesByUser.entries()).map(([userId, user]) => (
            <div key={userId} className="flex items-center gap-4">
              <Avatar name={user.userName} avatar={user.userAvatar} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground mb-1">
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
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Achievement unlock modal with confetti
function AchievementUnlockedModal({
  badges,
  onClose,
}: {
  badges: string[];
  onClose: () => void;
}) {
  const hasFireRef = useRef(false);

  useEffect(() => {
    if (hasFireRef.current) return;
    hasFireRef.current = true;

    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };
    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      const particleCount = 50 * (timeLeft / duration);

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });

      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-2xl shadow-2xl w-full max-w-md border border-border overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header glow */}
        <div className="relative bg-gradient-to-b from-brand-500/20 to-transparent px-8 pt-10 pb-6 text-center">
          <div className="text-6xl mb-4 animate-bounce">
            {"\uD83C\uDFC6"}
          </div>
          <h2 className="text-2xl font-bold text-foreground">
            Achievement Unlocked!
          </h2>
          <p className="text-muted-foreground mt-1">
            {badges.length === 1
              ? "You earned a new badge!"
              : `You earned ${badges.length} new badges!`}
          </p>
        </div>

        {/* Badge list */}
        <div className="px-8 pb-6 space-y-3">
          {badges.map((badgeType) => {
            const config = BADGE_CONFIG[badgeType];
            if (!config) return null;
            return (
              <div
                key={badgeType}
                className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border"
              >
                <div className="text-3xl shrink-0">{config.icon}</div>
                <div>
                  <div className="font-semibold text-foreground">
                    {config.label}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {config.description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Close button */}
        <div className="px-8 pb-8">
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-lg bg-brand-500 text-white font-medium hover:bg-brand-600 transition-colors"
          >
            Awesome!
          </button>
        </div>
      </div>
    </div>
  );
}

export function LeaderboardContent({
  categories,
  badges,
  newlyUnlocked,
}: {
  categories: LeaderboardCategory[];
  badges: BadgeEntry[];
  newlyUnlocked: string[];
}) {
  const [activeCategory, setActiveCategory] = useState(0);
  const [showUnlockModal, setShowUnlockModal] = useState(newlyUnlocked.length > 0);
  const category = categories[activeCategory];
  const userMedals = computeUserMedals(categories);

  return (
    <div className="space-y-6">
      {/* Achievement Unlock Modal */}
      {showUnlockModal && (
        <AchievementUnlockedModal
          badges={newlyUnlocked}
          onClose={() => setShowUnlockModal(false)}
        />
      )}

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
          <Podium entries={category.entries} userMedals={userMedals} />
        </CardContent>
      </Card>

      {/* Rankings Table (4th place and beyond) */}
      <RankingsTable entries={category.entries} />

      {/* Badges Section */}
      <BadgesSection badges={badges} />
    </div>
  );
}
