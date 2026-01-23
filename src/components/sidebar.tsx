"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signIn, signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";

// Check if we're in local dev mode (client-side check via env exposure)
const isLocalDevMode = !process.env.NEXT_PUBLIC_HAS_LINEAR_AUTH;

const navItems = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  { href: "/cases", label: "Test Cases", icon: TestCaseIcon },
  { href: "/runs", label: "Test Runs", icon: RunIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored === "true") {
      setCollapsed(true);
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  return (
    <div
      className={cn(
        "border-r border-border bg-[hsl(var(--sidebar))] flex flex-col transition-all duration-300 ease-in-out relative",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Collapse Toggle Button */}
      <button
        onClick={toggleCollapsed}
        className={cn(
          "absolute -right-3 top-6 z-10 w-6 h-6 rounded-full bg-background border border-border shadow-soft",
          "flex items-center justify-center text-muted-foreground hover:text-foreground",
          "transition-all duration-200 hover:shadow-card"
        )}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <ChevronLeftIcon
          className={cn(
            "w-3.5 h-3.5 transition-transform duration-300",
            collapsed && "rotate-180"
          )}
        />
      </button>

      {/* Logo / Branding */}
      <div className={cn("border-b border-border", collapsed ? "p-3" : "p-5")}>
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-soft group-hover:shadow-card transition-shadow shrink-0">
            <CheckmarkIcon className="w-4 h-4 text-white" />
          </div>
          <div
            className={cn(
              "overflow-hidden transition-all duration-300",
              collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
            )}
          >
            <span className="font-semibold text-foreground tracking-tight whitespace-nowrap">
              Simple<span className="text-brand-500">Tests</span>
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 space-y-1", collapsed ? "p-2" : "p-3")}>
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-all duration-200",
                collapsed
                  ? "justify-center p-2.5"
                  : "gap-3 px-3 py-2.5",
                isActive
                  ? "bg-brand-500/10 text-brand-600 dark:text-brand-400"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <item.icon
                className={cn(
                  "w-5 h-5 transition-colors shrink-0",
                  isActive ? "text-brand-500" : ""
                )}
              />
              <span
                className={cn(
                  "overflow-hidden transition-all duration-300 whitespace-nowrap",
                  collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Theme Toggle */}
      <div
        className={cn(
          "border-t border-border",
          collapsed ? "px-2 py-3" : "px-5 py-3"
        )}
      >
        {collapsed ? (
          <div className="flex justify-center">
            <ThemeToggle compact />
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">
              Theme
            </span>
            <ThemeToggle />
          </div>
        )}
      </div>

      {/* User Section */}
      <div className={cn("border-t border-border", collapsed ? "p-2" : "p-4")}>
        {isLocalDevMode ? (
          // Local dev mode - show local dev indicator
          <div
            className={cn(
              "flex items-center",
              collapsed ? "justify-center" : "gap-3"
            )}
          >
            <div
              className="w-9 h-9 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0"
              title={collapsed ? "Local Development" : undefined}
            >
              <CodeIcon className="w-4 h-4 text-amber-600" />
            </div>
            <div
              className={cn(
                "flex-1 min-w-0 overflow-hidden transition-all duration-300",
                collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              )}
            >
              <div className="text-sm font-medium truncate text-foreground">
                Local Dev
              </div>
              <div className="text-xs text-muted-foreground">
                No auth required
              </div>
            </div>
          </div>
        ) : status === "loading" ? (
          <div
            className={cn(
              "flex items-center",
              collapsed ? "justify-center" : "gap-3"
            )}
          >
            <div className="w-9 h-9 rounded-full bg-muted animate-pulse shrink-0" />
            {!collapsed && (
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 bg-muted rounded animate-pulse" />
                <div className="h-2 w-14 bg-muted rounded animate-pulse" />
              </div>
            )}
          </div>
        ) : session?.user ? (
          <div
            className={cn(
              "flex items-center",
              collapsed ? "justify-center" : "gap-3"
            )}
          >
            {session.user.image ? (
              <img
                src={session.user.image}
                alt=""
                title={collapsed ? session.user.name || "User" : undefined}
                className="w-9 h-9 rounded-full ring-2 ring-border shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full bg-brand-500/10 flex items-center justify-center shrink-0"
                title={collapsed ? session.user.name || "User" : undefined}
              >
                <span className="text-sm font-medium text-brand-600">
                  {session.user.name?.[0]?.toUpperCase() || "U"}
                </span>
              </div>
            )}
            <div
              className={cn(
                "flex-1 min-w-0 overflow-hidden transition-all duration-300",
                collapsed ? "w-0 opacity-0" : "w-auto opacity-100"
              )}
            >
              <div className="text-sm font-medium truncate text-foreground">
                {session.user.name}
              </div>
              <button
                onClick={() => signOut()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : collapsed ? (
          <button
            onClick={() => signIn("linear")}
            title="Sign in with Linear"
            className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center text-white hover:bg-brand-600 transition-colors mx-auto"
          >
            <LinearIcon className="w-4 h-4" />
          </button>
        ) : (
          <Button onClick={() => signIn("linear")} className="w-full" size="sm">
            <LinearIcon className="w-4 h-4" />
            Sign in with Linear
          </Button>
        )}
      </div>
    </div>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}

function CheckmarkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
      />
    </svg>
  );
}

function TestCaseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
      />
    </svg>
  );
}

function RunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
      />
    </svg>
  );
}

function LinearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="none">
      <path
        d="M1.22541 61.5228c-.2225-.9485.90748-1.5459 1.59638-.857L39.3342 97.1782c.6889.6889.0915 1.8189-.857 1.5765C17.7148 93.8498 3.60073 79.3544 1.22541 61.5228zM96.7746 38.4772c.2225.9485-.9075 1.5459-1.5964.857L58.6658 2.82183c-.6889-.68886-.0915-1.81892.857-1.57646C80.2852 6.15023 94.3993 20.6456 96.7746 38.4772z"
        fill="currentColor"
      />
      <path
        d="M87.2112 59.5496c.4076-.9266-.2877-1.9659-1.2984-1.9659H63.2174c-.7093 0-1.3429.4504-1.5759 1.1229l-7.5127 21.6712c-.3424.9876.5028 1.9938 1.5418 1.8352 16.4176-2.5085 30.0102-13.3052 31.5406-22.6634zM12.7888 40.4504c-.4076.9266.2877 1.9659 1.2984 1.9659h22.6954c.7093 0 1.3429-.4504 1.5759-1.1229l7.5127-21.6712c.3424-.9876-.5028-1.9937-1.5418-1.8352-16.4176 2.5085-30.0102 13.3052-31.5406 22.6634z"
        fill="currentColor"
      />
      <path
        d="M73.7646 13.8795c.8162-.6373.7204-1.8946-.1753-2.3919-3.8424-2.13323-8.0476-3.62939-12.4849-4.39629-.9762-.16889-1.8091.66728-1.6091 1.63629l7.2174 34.8958c.1704.8243 1.0855 1.2353 1.8207.8074l5.2312-3.2473z"
        fill="currentColor"
      />
      <path
        d="M26.2354 86.1205c-.8162.6373-.7204 1.8946.1753 2.3919 3.8424 2.1332 8.0476 3.6294 12.4849 4.3963.9762.1689 1.8091-.6673 1.6091-1.6363l-7.2174-34.8958c-.1704-.8243-1.0855-1.2353-1.8207-.8074l-5.2312 3.2473z"
        fill="currentColor"
      />
    </svg>
  );
}

function CodeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
      />
    </svg>
  );
}
