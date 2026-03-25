import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          Dashboard
        </h1>
        <p className="text-muted-foreground mt-1">
          Overview of your test management workspace
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                  <div className="h-7 w-12 bg-muted animate-pulse rounded" />
                </div>
                <div className="w-10 h-10 bg-muted animate-pulse rounded-lg" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Runs */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="h-5 w-32 bg-muted animate-pulse rounded" />
          <div className="h-8 w-24 bg-muted animate-pulse rounded-md" />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-border">
                <div className="w-2 h-2 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-6 w-20 bg-muted animate-pulse rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
