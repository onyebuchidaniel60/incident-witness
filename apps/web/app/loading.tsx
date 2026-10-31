export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-2xl py-8">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Loading</p>
      <div className="mt-4 space-y-3" aria-hidden="true">
        <div className="h-8 w-2/3 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
      </div>
      <p className="sr-only">Loading the requested page.</p>
    </div>
  );
}
