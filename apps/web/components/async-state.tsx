import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 text-[11px] text-iw-muted"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-iw-green motion-reduce:animate-none" />
      {label}
    </div>
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
    <div role="alert" className="iw-notice iw-notice-danger flex-col gap-2">
      <p className="flex items-center gap-2 font-semibold">
        <Icon name="alert" size="sm" />
        {title}
      </p>
      <p className="text-[11px] leading-5">{error.message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="iw-btn iw-btn-danger iw-btn-sm mt-1">
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[4px] border border-dashed border-iw-border-strong bg-white/[0.02] p-4 text-[11px] leading-5 text-iw-muted">
      <p className="font-semibold text-iw-ink">{title}</p>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger";

const toneClasses: Record<Tone, string> = {
  neutral: "iw-chip-neutral",
  success: "iw-chip-success",
  warning: "iw-chip-warning",
  danger: "iw-chip-danger",
};

export function StatusPill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return <span className={`iw-chip ${toneClasses[tone]}`}>{label}</span>;
}

const noticeToneClasses: Record<Tone, string> = {
  neutral: "iw-notice",
  success: "iw-notice iw-notice-success",
  warning: "iw-notice iw-notice-warning",
  danger: "iw-notice iw-notice-danger",
};

const noticeIcons: Record<Tone, IconName> = {
  neutral: "clock",
  success: "check",
  warning: "alert",
  danger: "alert",
};

export function InlineNotice({
  tone = "neutral",
  title,
  icon,
  children,
}: {
  tone?: Tone;
  title?: string;
  icon?: IconName;
  children: ReactNode;
}) {
  const displayIcon = icon ?? noticeIcons[tone];

  return (
    <div className={`${noticeToneClasses[tone]} flex-col gap-1.5`}>
      {title ? (
        <p className="flex items-center gap-2 font-semibold">
          <Icon name={displayIcon} size="sm" />
          {title}
        </p>
      ) : null}
      <div className="text-[11px] leading-5">{children}</div>
    </div>
  );
}
