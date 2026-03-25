export default function ReleaseDetailLoading() {
  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <div className="h-4 w-16 bg-muted animate-pulse rounded" />
        <div className="h-4 w-3 bg-muted animate-pulse rounded" />
        <div className="h-4 w-28 bg-muted animate-pulse rounded" />
      </div>

      {/* Header */}
      <div className="mb-8 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-7 w-48 bg-muted animate-pulse rounded" />
          <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
        </div>
        <div className="h-4 w-36 bg-muted animate-pulse rounded" />
      </div>

      {/* Content sections */}
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="h-5 w-24 bg-muted animate-pulse rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border">
              <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
              <div className="flex-1">
                <div className="h-4 bg-muted animate-pulse rounded" style={{ width: `${120 + Math.random() * 150}px` }} />
              </div>
              <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
