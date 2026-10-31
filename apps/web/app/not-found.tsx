import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="iw-container py-16">
      <div className="iw-panel max-w-2xl p-6">
        <p className="iw-eyebrow">
          <span className="iw-eyebrow-dot" />
          404
        </p>
        <h1 className="mt-3 text-2xl leading-tight text-iw-ink">Page not found</h1>
        <p className="mt-3 text-[11px] leading-6 text-iw-muted">
          The requested route does not exist in this application.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/" className="iw-btn iw-btn-primary iw-btn-sm">
            Return home
          </Link>
          <Link href="/docs" className="iw-btn iw-btn-secondary iw-btn-sm">
            Documentation
          </Link>
        </div>
      </div>
    </main>
  );
}
