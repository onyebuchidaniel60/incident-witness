import type { Metadata } from "next";
import type { ReactNode } from "react";

import { siteDescription, siteName, siteUrl } from "@/lib/site";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: "Incident Witness — Portable incident evidence",
    template: "%s | Incident Witness",
  },
  description: siteDescription,
  openGraph: {
    type: "website",
    siteName,
    title: "Incident Witness — Portable incident evidence",
    description: siteDescription,
    url: "/",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Incident Witness — Portable incident evidence",
    description: siteDescription,
  },
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
