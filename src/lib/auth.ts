import NextAuth from "next-auth";
import type { OAuthConfig } from "next-auth/providers";
import type { JWT } from "next-auth/jwt";
import { db } from "./db";
import { users, organizations } from "./db/schema";
import { eq } from "drizzle-orm";
import { LinearClient } from "@linear/sdk";

// Linear tokens expire after 10 hours by default
// We'll refresh when there's less than 5 minutes left
const TOKEN_REFRESH_BUFFER_SECONDS = 5 * 60;

interface LinearTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

async function refreshLinearToken(refreshToken: string): Promise<LinearTokenResponse | null> {
  try {
    const response = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.LINEAR_CLIENT_ID!,
        client_secret: process.env.LINEAR_CLIENT_SECRET!,
      }),
    });

    if (!response.ok) {
      console.error("Failed to refresh Linear token:", response.status, await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error refreshing Linear token:", error);
    return null;
  }
}

interface LinearProfile {
  id: string;
  name: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  organization: {
    id: string;
    name: string;
    urlKey: string;
    logoUrl?: string;
  };
}

function LinearProvider(): OAuthConfig<LinearProfile> {
  return {
    id: "linear",
    name: "Linear",
    type: "oauth",
    authorization: {
      url: "https://linear.app/oauth/authorize",
      params: {
        scope: "read,write",
        response_type: "code",
        actor: "user",
      },
    },
    token: {
      url: "https://api.linear.app/oauth/token",
    },
    userinfo: {
      url: "https://api.linear.app/graphql",
      async request({ tokens }: { tokens: { access_token?: string } }) {
        const client = new LinearClient({ accessToken: tokens.access_token });
        const viewer = await client.viewer;
        const org = await viewer.organization;

        return {
          id: viewer.id,
          name: viewer.name,
          displayName: viewer.displayName,
          email: viewer.email,
          avatarUrl: viewer.avatarUrl,
          organization: {
            id: org.id,
            name: org.name,
            urlKey: org.urlKey,
            logoUrl: org.logoUrl,
          },
        };
      },
    },
    profile(profile) {
      return {
        id: profile.id,
        name: profile.displayName || profile.name,
        email: profile.email,
        image: profile.avatarUrl,
      };
    },
    clientId: process.env.LINEAR_CLIENT_ID,
    clientSecret: process.env.LINEAR_CLIENT_SECRET,
  };
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string;
      linearUsername: string;
      organizationId: string;
      organizationName: string;
      organizationUrlKey: string;
    };
    accessToken?: string;
    error?: "RefreshTokenError" | "RefreshTokenMissing";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    linearId?: string;
    linearUsername?: string;
    organizationId?: string;
    organizationName?: string;
    organizationUrlKey?: string;
    organizationLogo?: string;
    error?: "RefreshTokenError" | "RefreshTokenMissing";
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [LinearProvider()],
  pages: {
    signIn: "/signin",
    error: "/auth/error",
  },
  callbacks: {
    async jwt({ token, account, profile }): Promise<JWT> {
      // Initial sign-in: store tokens and profile info
      if (account && profile) {
        const linearProfile = profile as unknown as LinearProfile;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        // Calculate expiration time (expires_in is in seconds)
        token.accessTokenExpires = Date.now() + (account.expires_in as number) * 1000;
        token.linearId = linearProfile.id;
        token.linearUsername = linearProfile.name;
        token.organizationId = linearProfile.organization.id;
        token.organizationName = linearProfile.organization.name;
        token.organizationUrlKey = linearProfile.organization.urlKey;
        token.organizationLogo = linearProfile.organization.logoUrl;
        return token;
      }

      // Return token if it's still valid (with buffer time)
      const expiresAt = token.accessTokenExpires as number | undefined;
      if (expiresAt && Date.now() < expiresAt - TOKEN_REFRESH_BUFFER_SECONDS * 1000) {
        return token;
      }

      // Token expired or expiring soon - try to refresh
      const refreshToken = token.refreshToken as string | undefined;
      if (!refreshToken) {
        console.error("No refresh token available");
        // Mark token as errored so UI can prompt re-auth
        token.error = "RefreshTokenMissing";
        return token;
      }

      const refreshedTokens = await refreshLinearToken(refreshToken);
      if (!refreshedTokens) {
        console.error("Failed to refresh access token");
        token.error = "RefreshTokenError";
        return token;
      }

      // Update token with refreshed values
      token.accessToken = refreshedTokens.access_token;
      token.refreshToken = refreshedTokens.refresh_token;
      token.accessTokenExpires = Date.now() + refreshedTokens.expires_in * 1000;
      delete token.error;

      return token;
    },
    async signIn({ profile }) {
      if (!profile) return false;

      const linearProfile = profile as unknown as LinearProfile;

      // Upsert organization
      const existingOrg = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, linearProfile.organization.id))
        .get();

      if (!existingOrg) {
        await db.insert(organizations).values({
          id: linearProfile.organization.id,
          name: linearProfile.organization.name,
          urlKey: linearProfile.organization.urlKey,
          logoUrl: linearProfile.organization.logoUrl,
        });
      } else {
        await db
          .update(organizations)
          .set({
            name: linearProfile.organization.name,
            urlKey: linearProfile.organization.urlKey,
            logoUrl: linearProfile.organization.logoUrl,
          })
          .where(eq(organizations.id, linearProfile.organization.id));
      }

      // Upsert user
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.id, linearProfile.id))
        .get();

      if (!existingUser) {
        await db.insert(users).values({
          id: linearProfile.id,
          linearUsername: linearProfile.name,
          email: linearProfile.email,
          name: linearProfile.displayName || linearProfile.name,
          avatar: linearProfile.avatarUrl,
          organizationId: linearProfile.organization.id,
        });
      } else {
        await db
          .update(users)
          .set({
            linearUsername: linearProfile.name,
            email: linearProfile.email,
            name: linearProfile.displayName || linearProfile.name,
            avatar: linearProfile.avatarUrl,
            organizationId: linearProfile.organization.id,
          })
          .where(eq(users.id, linearProfile.id));
      }

      return true;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.linearId as string;
        session.user.linearUsername = token.linearUsername as string;
        session.user.organizationId = token.organizationId as string;
        session.user.organizationName = token.organizationName as string;
        session.user.organizationUrlKey = token.organizationUrlKey as string;
        session.accessToken = token.accessToken as string;
        if (token.error) {
          session.error = token.error;
        }
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
});

// Helper to get organization-scoped data
export async function getSessionWithOrg() {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return null;
  }
  return session;
}
