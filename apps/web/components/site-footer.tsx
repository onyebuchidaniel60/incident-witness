import Link from "next/link";

import { Icon } from "@/components/ui/icon";

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-iw-border py-8">
      <div className="iw-container flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link href="/" className="iw-logo text-iw-ink">
              <span className="iw-brand-mark h-8 w-8">
                <Icon name="hash" size="sm" />
              </span>
              Incident Witness
            </Link>
            <p className="mt-3 max-w-sm text-[10px] leading-5 text-iw-faint">
              Portable, signature-verifiable incident evidence for decentralized GPU compute.
              Evidence is a signed observation, not proof of cause.
            </p>
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-medium text-iw-muted">
              <li>
                <Link href="/docs" className="hover:text-iw-ink">
                  Documentation
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-iw-ink">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-iw-ink">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/verify" className="hover:text-iw-ink">
                  Verify
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/onyebuchidaniel60/incident-witness"
                  className="hover:text-iw-ink"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="flex flex-col gap-2 border-t border-iw-border pt-4 text-[9px] text-iw-faint md:flex-row md:items-center md:justify-between">
          <p>
            Incident Witness — staging workspace. Evidence services are verified locally; no
            production API is deployed.
          </p>
          <p className="font-mono uppercase tracking-[0.12em]">Provider-neutral · MVP</p>
        </div>
      </div>
    </footer>
  );
}
