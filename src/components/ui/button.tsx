import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "outline";
  size?: "sm" | "md" | "lg";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center font-medium transition-all duration-200",
          "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 focus:ring-offset-background",
          "disabled:opacity-50 disabled:pointer-events-none",
          "active:scale-[0.98]",
          // Size variants
          {
            "text-xs px-2.5 py-1.5 rounded-md gap-1.5": size === "sm",
            "text-sm px-4 py-2 rounded-lg gap-2": size === "md",
            "text-base px-6 py-2.5 rounded-lg gap-2.5": size === "lg",
          },
          // Color variants
          {
            "bg-primary text-primary-foreground hover:bg-brand-600 shadow-soft hover:shadow-card":
              variant === "primary",
            "bg-secondary text-secondary-foreground hover:bg-muted border border-border":
              variant === "secondary",
            "text-foreground hover:bg-muted": variant === "ghost",
            "bg-destructive text-destructive-foreground hover:bg-red-600":
              variant === "destructive",
            "border border-border bg-transparent text-foreground hover:bg-muted hover:border-muted-foreground/30":
              variant === "outline",
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
