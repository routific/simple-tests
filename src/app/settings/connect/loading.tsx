export default function ConnectLoading() {
  return (
    <div className="p-8 max-w-3xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Connect
        </h1>
        <p className="text-muted-foreground mt-1">
          Connect your AI assistant to SimpleTests
        </p>
      </div>

      {/* Info card */}
      <div className="h-48 bg-muted/50 animate-pulse rounded-lg mb-8" />

      {/* URL section */}
      <div className="space-y-3 mb-8">
        <div className="h-5 w-32 bg-muted animate-pulse rounded" />
        <div className="h-12 bg-muted animate-pulse rounded-lg" />
      </div>

      {/* Instructions */}
      <div className="space-y-3 mb-8">
        <div className="h-5 w-48 bg-muted animate-pulse rounded" />
        <div className="h-12 bg-muted animate-pulse rounded-lg" />
      </div>

      {/* Tools grid */}
      <div className="space-y-3">
        <div className="h-5 w-36 bg-muted animate-pulse rounded" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border border-border rounded-lg p-3 space-y-2">
              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
              <div className="h-3 w-40 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
