"use client";

import { useState } from "react";

export function ConfirmAction({
  label,
  confirmLabel = "Confirm",
  description,
  onConfirm,
  busy = false,
  disabled = false,
  destructive = false,
}: {
  label: string;
  confirmLabel?: string;
  description: string;
  onConfirm: () => void;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={disabled || busy}
        className={`rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:bg-slate-100 ${
          destructive
            ? "border-red-300 bg-white text-red-900 hover:bg-red-50"
            : "border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="leading-6">{description}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          disabled={busy}
          className="rounded-md bg-slate-900 px-3 py-2 font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {busy ? "Working…" : confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
