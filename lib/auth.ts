import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/**
 * Shared NextAuth configuration. Used by:
 *   - app/api/auth/[...nextauth]/route.ts  (the auth route)
 *   - app/api/chat/route.ts                 (reads session)
 *   - app/api/tts/route.ts                  (reads session)
 *
 * Required env:
 *   NEXTAUTH_SECRET
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 */
export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, trigger, session }) {
      // Store custom name in JWT when set via session update
      if (trigger === "update" && session?.name) {
        token.name = session.name;
      }
      return token;
    },
    async session({ session, token }) {
      // Make the stable NextAuth user id available on session.user.id
      if (session.user) {
        (session.user as any).id = token.sub;
        // Carry custom name from JWT into session
        (session.user as any).name = typeof token.name === "string" ? token.name : session.user.name;
      }
      return session;
    },
  },
};
