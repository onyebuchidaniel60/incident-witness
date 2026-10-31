import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 text-sm text-slate-600 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <p>Incident Witness — Phase 1 skeleton. No platform services are connected.</p>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            <li>
              <Link href="/docs" className="font-medium text-slate-800 hover:text-slate-950">
                Documentation
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="font-medium text-slate-800 hover:text-slate-950">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="font-medium text-slate-800 hover:text-slate-950">
                Terms
              </Link>
            </li>
            <li>
              <Link href="/verify" className="font-medium text-slate-800 hover:text-slate-950">
                Verify
              </Link>
            </li>
            <li>
              <a
                href="https://github.com/onyebuchidaniel60/incident-witness"
                className="font-medium text-slate-800 hover:text-slate-950"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
