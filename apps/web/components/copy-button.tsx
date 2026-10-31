"use client";

import { useState } from "react";

export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
      >
        {status === "copied" ? copiedLabel : label}
      </button>
      {status === "failed" ? (
        <span role="alert" className="text-sm text-red-800">
          Copy failed. Select the value manually.
        </span>
      ) : (
        <span role="status" aria-live="polite" className="sr-only">
          {status === "copied" ? "Copied to clipboard" : ""}
        </span>
      )}
    </span>
  );
}
