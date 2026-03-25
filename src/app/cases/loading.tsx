export default function CasesLoading() {
  return (
    <div className="flex h-full animate-fade-in">
      {/* Sidebar - Folder Tree */}
      <div className="w-64 border-r border-border p-4 space-y-2">
        <div className="h-5 w-20 bg-muted animate-pulse rounded mb-4" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-4 h-4 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded" style={{ width: `${60 + Math.random() * 60}px` }} />
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto flex flex-col">
        {/* Toolbar */}
        <div className="border-b border-border px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-64 bg-muted animate-pulse rounded-md" />
          <div className="h-8 w-24 bg-muted animate-pulse rounded-md" />
          <div className="flex-1" />
          <div className="h-8 w-32 bg-muted animate-pulse rounded-md" />
        </div>

        {/* Test case rows */}
        <div className="flex-1 p-0">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <div className="w-4 h-4 bg-muted animate-pulse rounded" />
              <div className="flex-1 space-y-1">
                <div className="h-4 bg-muted animate-pulse rounded" style={{ width: `${120 + Math.random() * 200}px` }} />
              </div>
              <div className="h-5 w-14 bg-muted animate-pulse rounded-full" />
              <div className="h-4 w-20 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
