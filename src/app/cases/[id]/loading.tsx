export default function TestCaseDetailLoading() {
  return (
    <div className="p-8 max-w-4xl animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <div className="h-4 w-20 bg-muted animate-pulse rounded" />
        <div className="h-4 w-3 bg-muted animate-pulse rounded" />
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
      </div>

      {/* Title + metadata */}
      <div className="mb-6 space-y-3">
        <div className="h-7 w-72 bg-muted animate-pulse rounded" />
        <div className="flex items-center gap-3">
          <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
          <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        </div>
      </div>

      {/* Scenarios */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-border rounded-lg p-4 space-y-3">
            <div className="h-5 w-48 bg-muted animate-pulse rounded" />
            <div className="space-y-2 pl-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-4 bg-muted animate-pulse rounded" style={{ width: `${150 + Math.random() * 250}px` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
