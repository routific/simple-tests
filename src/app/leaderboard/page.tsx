import { redirect } from "next/navigation";
import { getSessionWithOrg } from "@/lib/auth";
import { getLeaderboardData } from "./queries";
import { checkAndAwardBadges } from "./badges";
import { LeaderboardContent } from "./leaderboard-content";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const session = await getSessionWithOrg();
  if (!session) {
    redirect("/signin");
  }

  await checkAndAwardBadges(session.user.organizationId);
  const data = await getLeaderboardData(session.user.organizationId);

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Leaderboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Celebrating the most active contributors on your team
        </p>
      </div>

      <LeaderboardContent categories={data.categories} badges={data.badges} />
    </div>
  );
}
