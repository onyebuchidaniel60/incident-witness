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
        className={`iw-btn iw-btn-sm ${
          destructive ? "iw-btn-danger" : "iw-btn-secondary"
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="iw-notice iw-notice-warning flex-col gap-2">
      <p className="text-[10.5px] leading-5">{description}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          disabled={busy}
          className="iw-btn iw-btn-primary iw-btn-sm"
        >
          {busy ? "Working…" : confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="iw-btn iw-btn-secondary iw-btn-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
