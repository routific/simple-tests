import { Badge } from "@/components/ui/badge";

interface RunStatusBadgeProps {
  status: "in_progress" | "completed";
}

export function RunStatusBadge({ status }: RunStatusBadgeProps) {
  return (
    <Badge variant={status === "completed" ? "default" : "warning"}>
      {status === "in_progress" ? "In Progress" : "Completed"}
    </Badge>
  );
}

export function formatRunStatus(status: "in_progress" | "completed"): string {
  return status === "in_progress" ? "In Progress" : "Completed";
}
