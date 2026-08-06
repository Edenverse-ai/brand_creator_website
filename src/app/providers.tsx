"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";

const SESSION_REFETCH_SECONDS = 5 * 60;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={SESSION_REFETCH_SECONDS} refetchOnWindowFocus>
      <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
        {children}
      </ThemeProvider>
    </SessionProvider>
  );
}
