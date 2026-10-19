"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "@/components/ui/ConnectButton";
import NetworkBadge from "@/components/botchain/NetworkBadge";
import { app } from "@/lib/app-config";

export type NavItem = { href: string; label: string };

interface PageShellProps {
  children: React.ReactNode;
  nav?: NavItem[];
  title?: string;
  description?: string;
}

/**
 * Statement shell: white stock, a coloured head rule, a narrow billing column.
 *
 * The screen that matters belongs to a stranger who was sent a link and is deciding whether to
 * pay. Everything here is aimed at that moment: no dark theme, no jargon in the chrome, a visible
 * company-style masthead, and a column width that reads like a bill rather than a dashboard.
 */
export default function PageShell({ children, nav = [], title, description }: PageShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>
      <div style={{ height: "4px", background: "var(--accent)" }} aria-hidden="true" />

      <header className="flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="mx-auto w-full px-6 py-4 flex items-center justify-between gap-4" style={{ maxWidth: "780px" }}>
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <svg width="20" height="22" viewBox="0 0 20 22" aria-hidden="true">
              <rect x="1.5" y="1.5" width="17" height="19" rx="2" fill="none" stroke="var(--accent)" strokeWidth="2" />
              <path d="M5.5 7.5h9M5.5 11h9M5.5 14.5h5" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span className="text-[18px] font-semibold tracking-[-0.02em]">{app.name}</span>
          </Link>

          <div className="flex items-center gap-3">
            {nav.length > 1 && (
              <nav className="hidden sm:flex items-center gap-4 mr-1">
                {nav.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className="nav-link text-[14px] no-underline"
                      style={{ color: active ? "var(--accent)" : "var(--text-tertiary)" }}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            )}
            <NetworkBadge />
            <div style={{ width: "155px" }}><ConnectButton /></div>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full px-6 py-9" style={{ maxWidth: "780px" }}>
        {title && <h1 className="text-[30px] md:text-[34px]" style={{ color: "var(--text-primary)" }}>{title}</h1>}
        {description && (
          <p className="mt-3 text-[16px]" style={{ color: "var(--text-secondary)", maxWidth: "58ch" }}>
            {description}
          </p>
        )}
        <div className={title || description ? "mt-8" : ""}>{children}</div>
      </main>

      <footer className="flex-shrink-0 mx-auto w-full px-6 py-7" style={{ maxWidth: "780px", borderTop: "1px solid var(--border-subtle)" }}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>{app.tagline}</span>
          <div className="flex-1" />
          <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>Built on BOT Chain</span>
          <a href="https://botchain.ai" target="_blank" rel="noreferrer" className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>botchain.ai</a>
          <a href="https://scan.botchain.ai" target="_blank" rel="noreferrer" className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>BOT Chain Explorer</a>
        </div>
      </footer>
    </div>
  );
}
