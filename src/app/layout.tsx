import type { Metadata } from "next";
import type { ReactNode } from "react";
import { GuardedLink as Link, UnsavedNavigationProvider } from "./unsaved-navigation";
import "./globals.css";
import { ClerkProvider, Show, SignInButton, UserButton } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "TTRPG Campaign Builder",
  description: "Campaign design and preparation for tabletop RPG Game Masters.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <UnsavedNavigationProvider>
            <header>
              <Link href="/">TTRPG Campaign Builder</Link>
              <Show when="signed-out"><SignInButton mode="modal"><button>Sign in</button></SignInButton></Show>
              <Show when="signed-in"><UserButton showName /></Show>
            </header>
            {children}
          </UnsavedNavigationProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
