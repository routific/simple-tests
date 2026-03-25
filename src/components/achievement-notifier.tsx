"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import confetti from "canvas-confetti";
import { getAndMarkUnseenBadges } from "@/app/leaderboard/actions";
import { BADGE_CONFIG } from "@/app/leaderboard/leaderboard-content";
import { useSession } from "next-auth/react";

export function AchievementNotifier() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const hasFireRef = useRef(false);

  // Check for unseen badges on route changes
  useEffect(() => {
    if (!session?.user) return;

    // Small delay so the page action completes first
    const timeout = setTimeout(async () => {
      const unseen = await getAndMarkUnseenBadges();
      if (unseen.length > 0) {
        setUnlockedBadges(unseen);
        setShowModal(true);
        hasFireRef.current = false;
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [pathname, session?.user]);

  if (!showModal || unlockedBadges.length === 0) return null;

  return (
    <AchievementModal
      badges={unlockedBadges}
      hasFireRef={hasFireRef}
      onClose={() => {
        setShowModal(false);
        setUnlockedBadges([]);
      }}
    />
  );
}

function AchievementModal({
  badges,
  hasFireRef,
  onClose,
}: {
  badges: string[];
  hasFireRef: React.MutableRefObject<boolean>;
  onClose: () => void;
}) {
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
  }, [hasFireRef]);

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
          <div className="text-6xl mb-4 animate-bounce">{"\uD83C\uDFC6"}</div>
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
