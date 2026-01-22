import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { db } from "./db";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;

      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, user.email))
        .get();

      if (!existingUser) {
        await db.insert(users).values({
          id: crypto.randomUUID(),
          email: user.email,
          name: user.name || "Unknown",
          avatar: user.image,
        });
      }

      return true;
    },
    async session({ session }) {
      if (session.user?.email) {
        const dbUser = await db
          .select()
          .from(users)
          .where(eq(users.email, session.user.email))
          .get();

        if (dbUser) {
          session.user.id = dbUser.id;
        }
      }
      return session;
    },
  },
});
