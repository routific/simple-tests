"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

interface KeyboardShortcutsContextType {
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextType | null>(null);

export function useKeyboardShortcuts() {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error("useKeyboardShortcuts must be used within KeyboardShortcutsProvider");
  }
  return context;
}

interface Props {
  children: ReactNode;
}

export function KeyboardShortcutsProvider({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [showHelp, setShowHelp] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") {
      setSidebarCollapsed(true);
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" ||
                      target.tagName === "TEXTAREA" ||
                      target.tagName === "SELECT" ||
                      target.isContentEditable;

      // Allow escape to close help even in inputs
      if (e.key === "Escape") {
        if (showHelp) {
          setShowHelp(false);
          e.preventDefault();
          return;
        }
      }

      if (isInput) return;

      // Handle "g" prefix for navigation
      if (pendingG) {
        setPendingG(false);
        switch (e.key.toLowerCase()) {
          case "h":
            e.preventDefault();
            router.push("/");
            return;
          case "c":
            e.preventDefault();
            router.push("/cases");
            return;
          case "r":
            e.preventDefault();
            router.push("/runs");
            return;
        }
        return;
      }

      // Single key shortcuts
      switch (e.key) {
        case "g":
          setPendingG(true);
          // Reset after 1 second if no follow-up key
          setTimeout(() => setPendingG(false), 1000);
          return;

        case "?":
          e.preventDefault();
          setShowHelp(prev => !prev);
          return;

        case "[":
          e.preventDefault();
          toggleSidebar();
          return;

        case "c":
          // Create new - context dependent
          if (e.metaKey || e.ctrlKey) return; // Don't interfere with copy
          e.preventDefault();
          if (pathname.startsWith("/runs")) {
            router.push("/runs/new");
          } else if (pathname.startsWith("/cases") || pathname === "/") {
            router.push("/cases/new");
          }
          return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router, pathname, pendingG, showHelp, toggleSidebar]);

  return (
    <KeyboardShortcutsContext.Provider
      value={{
        showHelp,
        setShowHelp,
        sidebarCollapsed,
        toggleSidebar,
        setSidebarCollapsed,
      }}
    >
      {children}
      {showHelp && <KeyboardShortcutsHelp onClose={() => setShowHelp(false)} />}
    </KeyboardShortcutsContext.Provider>
  );
}

function KeyboardShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[hsl(var(--background))] rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto border border-[hsl(var(--border))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* Global Navigation */}
          <div>
            <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
              Global Navigation
            </h3>
            <div className="space-y-2">
              <ShortcutRow keys={["g", "h"]} description="Go to Dashboard" />
              <ShortcutRow keys={["g", "c"]} description="Go to Test Cases" />
              <ShortcutRow keys={["g", "r"]} description="Go to Test Runs" />
              <ShortcutRow keys={["c"]} description="Create new (context-dependent)" />
            </div>
          </div>

          {/* UI */}
          <div>
            <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
              Interface
            </h3>
            <div className="space-y-2">
              <ShortcutRow keys={["["]} description="Toggle sidebar" />
              <ShortcutRow keys={["?"]} description="Show this help" />
              <ShortcutRow keys={["Esc"]} description="Close modal / cancel" />
            </div>
          </div>

          {/* Test Run Execution */}
          <div>
            <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
              Test Run Execution
            </h3>
            <div className="space-y-2">
              <ShortcutRow keys={["p"]} description="Mark test as Passed" />
              <ShortcutRow keys={["f"]} description="Mark test as Failed" />
              <ShortcutRow keys={["b"]} description="Mark test as Blocked" />
              <ShortcutRow keys={["s"]} description="Mark test as Skipped" />
              <ShortcutRow keys={["j"]} description="Next scenario" />
              <ShortcutRow keys={["k"]} description="Previous scenario" />
              <ShortcutRow keys={["n"]} description="Focus notes field" />
              <ShortcutRow keys={["e"]} description="Edit run" />
            </div>
          </div>

          {/* List Navigation */}
          <div>
            <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
              List Navigation
            </h3>
            <div className="space-y-2">
              <ShortcutRow keys={["j", "/"]} altKeys={["↓"]} description="Move down" />
              <ShortcutRow keys={["k", "/"]} altKeys={["↑"]} description="Move up" />
              <ShortcutRow keys={["Enter"]} description="Open selected item" />
              <ShortcutRow keys={["Space"]} description="Toggle selection (in edit mode)" />
            </div>
          </div>

          {/* Common Actions */}
          <div>
            <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
              Actions
            </h3>
            <div className="space-y-2">
              <ShortcutRow keys={["⌘", "Enter"]} description="Save" />
              <ShortcutRow keys={["e"]} description="Edit current item" />
            </div>
          </div>
        </div>

        <div className="border-t border-[hsl(var(--border))] px-6 py-4 bg-[hsl(var(--muted))]/30">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Press <Kbd>?</Kbd> to toggle this help at any time
          </p>
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({
  keys,
  altKeys,
  description
}: {
  keys: string[];
  altKeys?: string[];
  description: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-[hsl(var(--foreground))]">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, i) => (
          <span key={i} className="flex items-center gap-1">
            {key === "/" ? (
              <span className="text-[hsl(var(--muted-foreground))] text-xs mx-1">or</span>
            ) : (
              <Kbd>{key}</Kbd>
            )}
          </span>
        ))}
        {altKeys && (
          <>
            <span className="text-[hsl(var(--muted-foreground))] text-xs mx-1">or</span>
            {altKeys.map((key, i) => (
              <Kbd key={i}>{key}</Kbd>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-medium bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded shadow-sm">
      {children}
    </kbd>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
