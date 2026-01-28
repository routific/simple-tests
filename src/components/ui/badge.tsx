import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "destructive" | "warning" | "info" | "outline" | "secondary";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
        {
          "bg-primary/10 text-primary": variant === "default",
          "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400":
            variant === "success",
          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400":
            variant === "destructive",
          "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400":
            variant === "warning",
          "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400":
            variant === "info",
          "border border-border text-foreground": variant === "outline",
          "bg-secondary text-secondary-foreground": variant === "secondary",
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
