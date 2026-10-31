import type { ReactNode } from "react";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p role="status" aria-live="polite" className="text-sm text-slate-600">
      {label}
    </p>
  );
}

export function ErrorState({
  error,
  onRetry,
  title = "This information could not be loaded.",
}: {
  error: Error;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-950"
    >
      <p className="font-semibold">{title}</p>
      <p className="mt-1 leading-6">{error.message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-red-400 bg-white px-3 py-2 font-medium text-red-950 hover:bg-red-100"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white p-5 text-sm leading-6 text-slate-700">
      <p className="font-semibold text-slate-950">{title}</p>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "border-slate-300 bg-slate-100 text-slate-800",
  success: "border-emerald-300 bg-emerald-50 text-emerald-950",
  warning: "border-amber-300 bg-amber-50 text-amber-950",
  danger: "border-red-300 bg-red-50 text-red-950",
};

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

export function InlineNotice({
  tone = "neutral",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-md border p-4 text-sm leading-6 ${toneClasses[tone]}`}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}
