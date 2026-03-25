export default function LeaderboardLoading() {
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

      {/* Podium */}
      <div className="flex items-end justify-center gap-4 mb-10 h-48">
        <div className="w-28 h-28 bg-muted animate-pulse rounded-lg" />
        <div className="w-28 h-36 bg-muted animate-pulse rounded-lg" />
        <div className="w-28 h-24 bg-muted animate-pulse rounded-lg" />
      </div>

      {/* Rankings table */}
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-border">
            <div className="w-6 h-6 bg-muted animate-pulse rounded-full" />
            <div className="w-8 h-8 bg-muted animate-pulse rounded-full" />
            <div className="flex-1 space-y-1">
              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
              <div className="h-3 w-20 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-5 w-12 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
