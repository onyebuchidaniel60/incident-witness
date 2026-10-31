import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl py-8">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Page not found</h1>
      <p className="mt-4 text-slate-700">
        The requested route does not exist in this Phase 2 structural shell.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Return home
        </Link>
        <Link
          href="/docs"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
        >
          Documentation
        </Link>
      </div>
    </div>
  );
}
