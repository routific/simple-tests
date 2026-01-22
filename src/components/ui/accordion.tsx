"use client";

import { useState, createContext, useContext, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AccordionContextValue {
  openItems: Set<string>;
  toggleItem: (id: string) => void;
  multiple?: boolean;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

interface AccordionProps {
  children: ReactNode;
  multiple?: boolean;
  defaultOpen?: string[];
  className?: string;
}

export function Accordion({
  children,
  multiple = false,
  defaultOpen = [],
  className,
}: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(defaultOpen));

  const toggleItem = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!multiple) {
          next.clear();
        }
        next.add(id);
      }
      return next;
    });
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggleItem, multiple }}>
      <div className={cn("divide-y divide-border", className)}>{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function AccordionItem({ id, children, className }: AccordionItemProps) {
  return <div className={cn("", className)}>{children}</div>;
}

interface AccordionTriggerProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function AccordionTrigger({
  id,
  children,
  className,
}: AccordionTriggerProps) {
  const context = useContext(AccordionContext);
  if (!context) throw new Error("AccordionTrigger must be used within Accordion");

  const isOpen = context.openItems.has(id);

  return (
    <button
      onClick={() => context.toggleItem(id)}
      className={cn(
        "flex w-full items-center justify-between py-3 px-4 text-left font-medium transition-colors hover:bg-muted/50",
        className
      )}
    >
      {children}
      <ChevronIcon
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180"
        )}
      />
    </button>
  );
}

interface AccordionContentProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export function AccordionContent({
  id,
  children,
  className,
}: AccordionContentProps) {
  const context = useContext(AccordionContext);
  if (!context) throw new Error("AccordionContent must be used within Accordion");

  const isOpen = context.openItems.has(id);

  if (!isOpen) return null;

  return (
    <div
      className={cn("px-4 pb-4 pt-0 animate-fade-in", className)}
    >
      {children}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
