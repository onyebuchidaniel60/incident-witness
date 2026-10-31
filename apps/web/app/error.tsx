"use client";

import Link from "next/link";

import { Icon } from "@/components/ui/icon";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" tabIndex={-1} className="iw-container py-16">
      <div className="iw-panel max-w-2xl p-6">
        <p className="iw-eyebrow">
          <span className="iw-eyebrow-dot" />
          Route error
        </p>
        <h1 className="mt-3 text-2xl leading-tight text-iw-ink">
          This page could not be displayed
        </h1>
        <p className="mt-3 text-[11px] leading-6 text-iw-muted">
          This page encountered an unexpected error. No provider credentials are exposed in the
          error reference.
        </p>
        <p className="mt-2 font-mono text-[9px] text-iw-faint">
          Reference: {error.digest ?? "no digest available"}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={reset} className="iw-btn iw-btn-primary iw-btn-sm">
            <Icon name="activity" size="sm" />
            Try again
          </button>
          <Link href="/" className="iw-btn iw-btn-secondary iw-btn-sm">
            Return home
          </Link>
          <Link href="/docs" className="iw-btn iw-btn-ghost iw-btn-sm">
            Documentation
          </Link>
        </div>
      </div>
    </main>
  );
}
