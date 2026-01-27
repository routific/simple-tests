import NextAuth from "next-auth";
import type { OAuthConfig } from "next-auth/providers";
import { db } from "./db";
import { users, organizations } from "./db/schema";
import { eq } from "drizzle-orm";
import { LinearClient } from "@linear/sdk";

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
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [LinearProvider()],
  pages: {
    signIn: "/signin",
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const linearProfile = profile as unknown as LinearProfile;
        token.accessToken = account.access_token;
        token.linearId = linearProfile.id;
        token.linearUsername = linearProfile.name;
        token.organizationId = linearProfile.organization.id;
        token.organizationName = linearProfile.organization.name;
        token.organizationUrlKey = linearProfile.organization.urlKey;
        token.organizationLogo = linearProfile.organization.logoUrl;
      }
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
