"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { MobileAuthLink } from "./auth-controls";
import { ArrowRight, ArrowUpRight, ChevronDown } from "./icons";

const links = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/methodology", label: "How we count" },
  { href: "/docs", label: "Docs" },
  { href: "/enterprise", label: "For teams" },
];

export function SiteNavigation() {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  return <>
    <nav aria-label="Main navigation" className="desktop-nav">{links.map((link) => <Link aria-current={pathname === link.href ? "page" : undefined} href={link.href} key={link.href}>{link.label}</Link>)}</nav>
    <details className="mobile-nav" ref={menu} onKeyDown={(event) => { if (event.key === "Escape" && menu.current) { menu.current.open = false; menu.current.querySelector("summary")?.focus(); } }}>
      <summary aria-label="Open navigation"><span>Menu</span><ChevronDown size={16} /></summary>
      <nav aria-label="Mobile navigation" onClick={(event) => { if ((event.target as Element).closest("a") && menu.current) menu.current.open = false; }}>
        {links.map((link) => <Link aria-current={pathname === link.href ? "page" : undefined} href={link.href} key={link.href}>{link.label}<ArrowRight size={14} /></Link>)}
        <MobileAuthLink /><Link href="/docs">Connect data <ArrowUpRight size={14} /></Link>
      </nav>
    </details>
  </>;
}
