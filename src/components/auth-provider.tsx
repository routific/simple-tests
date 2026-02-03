"use client";

import { SessionProvider } from "next-auth/react";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // Reduce session fetching - only refetch every 5 minutes instead of default
      refetchInterval={5 * 60}
      // Don't refetch on window focus to reduce API calls
      refetchOnWindowFocus={false}
    >
      {children}
    </SessionProvider>
  );
}
