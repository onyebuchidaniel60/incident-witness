export default function Loading() {
  return (
    <div className="iw-container py-16">
      <div role="status" aria-live="polite" className="max-w-2xl">
        <p className="iw-eyebrow">
          <span className="iw-eyebrow-dot" />
          Loading
        </p>
        <div className="mt-5 space-y-2.5" aria-hidden="true">
          <div className="h-8 w-2/3 animate-pulse rounded-[4px] bg-iw-surface-3 motion-reduce:animate-none" />
          <div className="h-3 w-full animate-pulse rounded-[4px] bg-iw-surface-2 motion-reduce:animate-none" />
          <div className="h-3 w-5/6 animate-pulse rounded-[4px] bg-iw-surface-2 motion-reduce:animate-none" />
        </div>
        <p className="sr-only">Loading the requested page.</p>
      </div>
    </div>
  );
}
