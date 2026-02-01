"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";

interface KeyboardShortcutsContextType {
  showHelp: boolean;
  setShowHelp: (show: boolean) => void;
  showVersionInfo: boolean;
  setShowVersionInfo: (show: boolean) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  isAutoCollapsed: boolean;
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

const BREAKPOINT_XL = 1280;

export function KeyboardShortcutsProvider({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [showHelp, setShowHelp] = useState(false);
  const [showVersionInfo, setShowVersionInfo] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAutoCollapsed, setIsAutoCollapsed] = useState(false);
  const [pendingG, setPendingG] = useState(false);

  // Load sidebar state from localStorage on mount and set up responsive listener
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    const mediaQuery = window.matchMedia(`(max-width: ${BREAKPOINT_XL - 1}px)`);

    // Set initial state based on screen size
    if (mediaQuery.matches) {
      setSidebarCollapsed(true);
      setIsAutoCollapsed(true);
    } else if (stored === "true") {
      setSidebarCollapsed(true);
    }

    // Listen for screen size changes
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        // Below breakpoint - auto collapse
        setSidebarCollapsed(true);
        setIsAutoCollapsed(true);
      } else {
        // Above breakpoint - restore user preference
        setIsAutoCollapsed(false);
        const storedPref = localStorage.getItem("sidebar-collapsed");
        setSidebarCollapsed(storedPref === "true");
      }
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    return () => mediaQuery.removeEventListener("change", handleMediaChange);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      // Only save to localStorage if not auto-collapsed by responsive behavior
      if (!isAutoCollapsed) {
        localStorage.setItem("sidebar-collapsed", String(next));
      }
      return next;
    });
  }, [isAutoCollapsed]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" ||
                      target.tagName === "TEXTAREA" ||
                      target.tagName === "SELECT" ||
                      target.isContentEditable;

      // CMD+SHIFT+I - Show version info (works even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setShowVersionInfo(prev => !prev);
        return;
      }

      // Allow escape to close help/version info even in inputs
      if (e.key === "Escape") {
        if (showVersionInfo) {
          setShowVersionInfo(false);
          e.preventDefault();
          return;
        }
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
  }, [router, pathname, pendingG, showHelp, showVersionInfo, toggleSidebar]);

  return (
    <KeyboardShortcutsContext.Provider
      value={{
        showHelp,
        setShowHelp,
        showVersionInfo,
        setShowVersionInfo,
        sidebarCollapsed,
        toggleSidebar,
        setSidebarCollapsed,
        isAutoCollapsed,
      }}
    >
      {children}
      {showHelp && <KeyboardShortcutsHelp onClose={() => setShowHelp(false)} />}
      {showVersionInfo && <VersionInfoModal onClose={() => setShowVersionInfo(false)} />}
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
              <ShortcutRow keys={["⌘", "⇧", "I"]} description="Show version info" />
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

// Changelog entries - newest first
const CHANGELOG = [
  {
    version: "522462e",
    date: "2026-01-31",
    changes: [
      "Add test result history tracking",
      "Show full folder hierarchy in test run scenario view",
      "Add Linear issue linking tools to MCP server",
      "Collapse subfolders by default and add expand/collapse all button",
    ],
  },
  {
    version: "3120ba6",
    date: "2026-01-30",
    changes: [
      "Add Linear issue linking to test cases",
      "Add MCP feature to signin page",
      "Add expand all button and UI improvements",
    ],
  },
  {
    version: "b806f9c",
    date: "2026-01-29",
    changes: [
      "Extract shared TestRunRow component for test run rows",
      "Improve test run list display",
    ],
  },
];

function VersionInfoModal({ onClose }: { onClose: () => void }) {
  const gitSha = process.env.NEXT_PUBLIC_GIT_SHA || "development";
  const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-[hsl(var(--background))] rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-auto border border-[hsl(var(--border))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">About SimpleTests</h2>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
              Version info and changelog
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Version Info */}
          <div className="mb-6 p-4 rounded-lg bg-[hsl(var(--muted))]/50 border border-[hsl(var(--border))]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-brand-500 flex items-center justify-center">
                <span className="text-white font-bold text-lg">ST</span>
              </div>
              <div>
                <div className="font-semibold">SimpleTests</div>
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  Test case management for modern teams
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-[hsl(var(--muted-foreground))]">Git SHA: </span>
                <code className="font-mono bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded text-xs">
                  {gitSha}
                </code>
              </div>
              {buildTime && (
                <div>
                  <span className="text-[hsl(var(--muted-foreground))]">Built: </span>
                  <span>{new Date(buildTime).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Changelog */}
          <div>
            <h3 className="text-sm font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-3">
              Changelog
            </h3>
            <div className="space-y-4">
              {CHANGELOG.map((release, idx) => (
                <div key={release.version} className="relative pl-4 border-l-2 border-[hsl(var(--border))]">
                  <div className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-[hsl(var(--border))]" />
                  <div className="flex items-center gap-2 mb-1">
                    <code className="font-mono text-xs bg-[hsl(var(--muted))] px-1.5 py-0.5 rounded">
                      {release.version}
                    </code>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      {release.date}
                    </span>
                    {idx === 0 && (
                      <span className="text-xs bg-brand-500/10 text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded font-medium">
                        Current
                      </span>
                    )}
                  </div>
                  <ul className="text-sm space-y-1">
                    {release.changes.map((change, i) => (
                      <li key={i} className="text-[hsl(var(--foreground))]">
                        • {change}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-[hsl(var(--border))] px-6 py-4 bg-[hsl(var(--muted))]/30">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Press <Kbd>⌘</Kbd> <Kbd>⇧</Kbd> <Kbd>I</Kbd> to toggle this view
          </p>
        </div>
      </div>
    </div>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
