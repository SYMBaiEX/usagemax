import Link from "next/link";

import { HeaderAuthControls } from "./auth-controls";
import { ArrowUpRight } from "./icons";
import { SiteNavigation } from "./site-navigation";
import { SystemThemeButton, ThemeControls } from "./theme-controls";
import { CodeField } from "./code-field";
import { BrandIcon } from "./brand-icon";

export function SiteHeader() {
  return (
    <header className="site-header">
        <div className="shell header-inner">
        <Link aria-label="UsageMax home" className="brand" href="/">
          <BrandIcon />
          <span className="brand-wordmark">
            Usage<span>Max</span>
          </span>
        </Link>

        <SiteNavigation />
        <ThemeControls />

        <div className="header-actions">
          <HeaderAuthControls />
          <Link className="header-cta" href="/docs">
            Connect data <ArrowUpRight size={15} />
          </Link>
        </div>

        </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <CodeField variant="footer" />
      <div className="shell footer-main">
        <div className="footer-brand-block">
          <Link aria-label="UsageMax home" className="brand" href="/">
            <BrandIcon />
            <span className="brand-wordmark">
              Usage<span>Max</span>
            </span>
          </Link>
        </div>
        <div className="footer-links">
          <div>
            <p className="footer-heading">Explore</p>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/methodology">Methodology</Link>
          </div>
          <div>
            <p className="footer-heading">Build</p>
            <Link href="/docs">Documentation</Link>
            <Link href="/enterprise">Enterprise</Link>
            <Link href="/security">Security</Link>
            <a href="https://registry.modelcontextprotocol.io/v0.1/servers/io.github.SYMBaiEX%2Fusagemax/versions/latest" target="_blank" rel="noreferrer">MCP Registry ↗</a>
          </div>
          <div>
            <p className="footer-heading">Legal</p>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="mailto:hello@usagemax.com">Contact</a>
          </div>
        </div>
      </div>
      <div className="shell footer-wordmark" aria-hidden="true">UsageMax<span>↗</span></div>
      <div className="shell footer-bottom">
        <span>© 2026 UsageMax</span>
        <SystemThemeButton />
        <span className="footer-status">
          <span className="live-dot" />
          First-party usage analytics
        </span>
        <a href="https://github.com/SYMBaiEX/usagemax" target="_blank" rel="noreferrer">Built in the open ↗</a>
      </div>
    </footer>
  );
}

export function PageIntro({
  title,
  children,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="page-intro shell">
      <div className="intro-ambient"><CodeField /></div>
      <div className="page-title-row"><h1>{title}</h1>{children ? <div className="page-intro-actions">{children}</div> : null}</div>
    </section>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link className="text-link" href={href}>
      {children} <ArrowUpRight size={15} />
    </Link>
  );
}
