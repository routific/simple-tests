export default function ReleasesLoading() {
  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Releases
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage releases synced from Linear
          </p>
        </div>
        <div className="h-8 w-36 bg-muted animate-pulse rounded-md" />
      </div>

      {/* Release cards */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-lg border border-border">
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-5 bg-muted animate-pulse rounded" style={{ width: `${100 + Math.random() * 100}px` }} />
                <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
              </div>
              <div className="h-3 w-28 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-4 w-16 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
