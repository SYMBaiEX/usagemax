import Link from "next/link";

import { HeaderAuthControls, MobileAuthLink } from "./auth-controls";
import { ArrowRight, ArrowUpRight, ChevronDown, UsageMark } from "./icons";

const navigation = [
  { href: "/leaderboard", label: "Explore" },
  { href: "/methodology", label: "How it works" },
  { href: "/docs", label: "Connect" },
  { href: "/enterprise", label: "For teams" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
        <div className="shell header-inner">
        <Link aria-label="UsageMax home" className="brand" href="/">
          <span className="brand-mark">
            <UsageMark size={27} />
          </span>
          <span className="brand-wordmark">
            Usage<span>Max</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="desktop-nav">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <HeaderAuthControls />
          <Link className="header-cta" href="/docs">
            Connect data <ArrowUpRight size={15} />
          </Link>
        </div>

        <details className="mobile-nav">
          <summary aria-label="Open navigation">
            <span className="mobile-nav-label">Menu</span>
            <ChevronDown size={17} />
          </summary>
          <nav aria-label="Mobile navigation">
            {navigation.map((item) => (
              <Link href={item.href} key={item.href}>
                {item.label} <ArrowRight size={14} />
              </Link>
            ))}
            <MobileAuthLink />
            <Link href="/docs">
              Connect data <ArrowUpRight size={14} />
            </Link>
          </nav>
        </details>
        </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-main">
        <div className="footer-brand-block">
          <Link aria-label="UsageMax home" className="brand" href="/">
            <span className="brand-mark">
              <UsageMark size={25} />
            </span>
            <span className="brand-wordmark">
              Usage<span>Max</span>
            </span>
          </Link>
          <p>Your AI usage, made visible. A public record of the work behind the work.</p>
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
          </div>
          <div>
            <p className="footer-heading">Legal</p>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <a href="mailto:hello@usagemax.com">Contact</a>
          </div>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>© 2026 UsageMax</span>
        <span className="footer-status">
          <span className="live-dot" />
          Realtime on Convex
        </span>
        <span>Make the work visible</span>
      </div>
    </footer>
  );
}

export function PageIntro({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="page-intro shell">
      <div className="eyebrow">
        <span className="eyebrow-line" />
        {eyebrow}
      </div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children ? <div className="page-intro-actions">{children}</div> : null}
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
