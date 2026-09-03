'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * Client-side wrapper that provides NextAuth session context to all child components.
 * Must be used inside a client boundary — this file itself is a client component.
 */
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
