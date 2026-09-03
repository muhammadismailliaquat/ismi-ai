import { withAuth } from "next-auth/middleware";

/**
 * Server-side route protection via NextAuth JWT.
 *
 * Requests to /chat or /settings without a valid NextAuth session cookie are
 * redirected to /login (configured as the signIn page in lib/auth.ts).
 */
export default withAuth({
  callbacks: {
    authorized({ token }) {
      return !!token;
    },
  },
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/chat/:path*", "/settings/:path*"],
};
