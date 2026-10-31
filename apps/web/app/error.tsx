"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Route error</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        This page could not be displayed
      </h1>
      <p className="mt-4 text-slate-700">
        The Phase 2 shell encountered an unexpected error. No provider data or credentials are
        involved.
      </p>
      <p className="mt-2 text-sm text-slate-600">
        Reference: <code>{error.digest ?? "no digest available"}</code>
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        Try again
      </button>
    </div>
  );
}
