"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const ERROR_MESSAGES: Record<string, { title: string; description: string; tips: string[] }> = {
  OAuthCallback: {
    title: "Sign in failed",
    description: "There was a problem completing the sign-in with Linear.",
    tips: [
      "Make sure cookies are enabled in your browser",
      "Try using a regular browser window (not incognito/private)",
      "Disable any privacy extensions temporarily",
      "Clear your browser cookies and try again",
      "Complete the sign-in process promptly without refreshing",
    ],
  },
  OAuthAccountNotLinked: {
    title: "Account already exists",
    description: "An account with this email already exists using a different sign-in method.",
    tips: [
      "Try signing in with the method you used originally",
      "Contact support if you need to link your accounts",
    ],
  },
  AccessDenied: {
    title: "Access denied",
    description: "You do not have permission to sign in.",
    tips: [
      "Make sure you're using the correct Linear account",
      "Contact your administrator if you believe this is an error",
    ],
  },
  Verification: {
    title: "Verification failed",
    description: "The sign-in link is no longer valid.",
    tips: [
      "Sign-in links expire after a short time",
      "Request a new sign-in link",
    ],
  },
  Default: {
    title: "Sign in error",
    description: "An unexpected error occurred during sign in.",
    tips: [
      "Try signing in again",
      "Clear your browser cookies and cache",
      "Try using a different browser",
      "If the problem persists, contact support",
    ],
  },
};

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<AuthErrorContent error="Default" />}>
      <AuthErrorWithParams />
    </Suspense>
  );
}

function AuthErrorWithParams() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "Default";
  return <AuthErrorContent error={error} />;
}

function AuthErrorContent({ error }: { error: string }) {
  const errorInfo = ERROR_MESSAGES[error] || ERROR_MESSAGES.Default;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-brand-50 dark:from-slate-950 dark:via-slate-900 dark:to-brand-950 flex flex-col">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-brand-500/10 rounded-full blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-4">
        {/* Logo */}
        <div className="mb-8 flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg shadow-brand-500/25">
            <CheckmarkIcon className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              Simple<span className="text-brand-500">Tests</span>
            </h1>
            <p className="text-sm text-muted-foreground">Test Case Management</p>
          </div>
        </div>

        {/* Error card */}
        <div className="w-full max-w-md bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 border border-slate-200/50 dark:border-slate-800/50 p-8">
          {/* Error icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <ErrorIcon className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-2">
              {errorInfo.title}
            </h2>
            <p className="text-muted-foreground">
              {errorInfo.description}
            </p>
          </div>

          {/* Tips */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 mb-6">
            <p className="text-sm font-medium text-foreground mb-3">Things to try:</p>
            <ul className="space-y-2">
              {errorInfo.tips.map((tip, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-brand-500 mt-0.5">•</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Link href="/signin" className="block">
              <Button className="w-full h-11 text-base font-medium bg-[#5E6AD2] hover:bg-[#4F5BC7] text-white">
                Try again
              </Button>
            </Link>
            <Link href="/" className="block">
              <Button variant="outline" className="w-full h-11 text-base">
                Go to homepage
              </Button>
            </Link>
          </div>

          {/* Error code for debugging */}
          <p className="text-xs text-muted-foreground text-center mt-6">
            Error code: {error}
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="relative py-6 text-center">
        <p className="text-sm text-muted-foreground">
          If this keeps happening, please contact support
        </p>
      </div>
    </div>
  );
}

function CheckmarkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}
