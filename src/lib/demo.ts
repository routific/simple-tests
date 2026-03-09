import type { Session } from "next-auth";

export const DEMO_ORG_ID = "demo-org-001";
export const DEMO_USER_ID = "demo-user-001";

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export function getDemoSession(): Session {
  return {
    user: {
      id: DEMO_USER_ID,
      name: "Demo User",
      email: "demo@cloudsync.example",
      image: undefined,
      linearUsername: "demo-user",
      organizationId: DEMO_ORG_ID,
      organizationName: "CloudSync",
      organizationUrlKey: "cloudsync",
    },
    accessToken: "demo-token-not-valid",
    expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
