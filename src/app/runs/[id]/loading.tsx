export default function RunDetailLoading() {
  return (
    <div className="flex h-full animate-fade-in">
      {/* Sidebar - scenario list */}
      <div className="w-80 border-r border-border p-4 space-y-2">
        <div className="h-5 w-32 bg-muted animate-pulse rounded mb-4" />
        <div className="h-8 w-full bg-muted animate-pulse rounded-md mb-3" />
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md">
            <div className="w-5 h-5 bg-muted animate-pulse rounded" />
            <div className="flex-1 space-y-1">
              <div className="h-4 bg-muted animate-pulse rounded" style={{ width: `${80 + Math.random() * 100}px` }} />
              <div className="h-3 w-20 bg-muted animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Content - scenario detail */}
      <div className="flex-1 p-8">
        <div className="max-w-3xl space-y-6">
          {/* Header */}
          <div className="space-y-2">
            <div className="h-6 w-64 bg-muted animate-pulse rounded" />
            <div className="h-4 w-40 bg-muted animate-pulse rounded" />
          </div>

          {/* Status buttons */}
          <div className="flex items-center gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-9 w-20 bg-muted animate-pulse rounded-md" />
            ))}
          </div>

          {/* Gherkin content */}
          <div className="border border-border rounded-lg p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-4 bg-muted animate-pulse rounded" style={{ width: `${100 + Math.random() * 300}px` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
