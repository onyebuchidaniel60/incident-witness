import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Incident Witness",
    template: "%s | Incident Witness",
  },
  description:
    "Incident Witness is a portable incident-evidence protocol for decentralized compute. Collect source-attributed observations, seal a signed evidence bundle and verify it locally.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="min-h-screen font-sans antialiased">
        <a
          href="#main-content"
          className="iw-btn iw-btn-primary sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100]"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
