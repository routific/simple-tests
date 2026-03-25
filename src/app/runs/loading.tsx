export default function RunsLoading() {
  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Test Runs
          </h1>
          <p className="text-muted-foreground mt-1">
            Track and manage your testing sessions
          </p>
        </div>
        <div className="h-9 w-24 bg-muted animate-pulse rounded-md" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-32 bg-muted animate-pulse rounded-md" />
        <div className="h-8 w-32 bg-muted animate-pulse rounded-md" />
      </div>

      {/* Run rows */}
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-lg border border-border">
            <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-muted animate-pulse rounded" style={{ width: `${150 + Math.random() * 150}px` }} />
              <div className="h-3 w-40 bg-muted animate-pulse rounded" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-20 bg-muted animate-pulse rounded-full" />
              <div className="h-6 w-6 bg-muted animate-pulse rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
