import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight, ArrowUpRight, Check, ShieldCheck } from "@/components/icons";
import { PageIntro, TextLink } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Pricing",
  description: "UsageMax is free for individual builders and small teams, with custom enterprise capacity by agreement.",
  alternates: { canonical: "https://usagemax.com/pricing" },
};

const plans = [
  {
    eyebrow: "01 / PERSONAL",
    title: "Free for builders",
    description: "Keep a complete, private record of your AI work across the computers and models you use.",
    items: ["Linked computers and supported local histories", "One-shot sync and bounded exports", "Optional public profile and leaderboard", "Native telemetry and OTLP/HTTP JSON"],
    action: "Read the docs",
    href: "/docs",
    tone: "detail-card-orange",
  },
  {
    eyebrow: "02 / TEAMS",
    title: "Free for small teams",
    description: "Give a small group one private view of usage, ownership, projects, and cost context.",
    items: ["Invitations, roles, and private workspaces", "Shared provider and model reporting", "Project and cost-center dimensions", "No card required"],
    action: "Open a workspace",
    href: "/workspace",
    tone: "detail-card-cyan",
  },
  {
    eyebrow: "03 / TEAM OPERATIONS",
    title: "Paid when you need the operating layer",
    description: "Keep the free workspace available, then add a Stripe-managed commitment for governance, billing, and team operations.",
    items: ["Stripe Checkout and customer portal", "100 members / 250 devices", "200 projects / 50 budgets", "No token-count billing"],
    action: "Open workspace billing",
    href: "/workspace",
    tone: "detail-card-orange",
  },
  {
    eyebrow: "04 / ENTERPRISE",
    title: "Capacity by agreement",
    description: "Shape the operating model around your identity, data, retention, residency, and support requirements.",
    items: ["Higher member, device, and telemetry capacity", "SSO and directory integration", "Private attribution and longer retention", "Scoped security and service commitments"],
    action: "Talk to the team",
    href: "/contact",
    tone: "detail-card-acid",
  },
] as const;

export default function PricingPage() {
  return (
    <div className="page-surface content-page pricing-page">
      <PageIntro title={<>A useful record.<br /><span className="text-accent">A fair starting point.</span></>}>
        <Link className="button button-acid" href="/workspace">Start free <ArrowRight size={16} /></Link>
        <Link className="button button-outline" href="/enterprise">For teams <ArrowUpRight size={16} /></Link>
      </PageIntro>

      <div className="shell">
        <section className="pricing-intro content-section" aria-labelledby="pricing-title">
          <div className="section-heading"><h2 id="pricing-title">Start with the complete core.</h2><p>UsageMax keeps individual and small-team observability open. Enterprise work is scoped to the capacity and controls a real organization needs.</p></div>
          <div className="pricing-grid">
            {plans.map((plan) => (
              <article className={`detail-card ${plan.tone}`} key={plan.title}>
                <div className="detail-card-top"><span>{plan.eyebrow}</span><span className="detail-card-icon"><ShieldCheck size={17} /></span></div>
                <h3>{plan.title}</h3>
                <div className="detail-card-copy">
                  <p>{plan.description}</p>
                  <ul className="pricing-list">
                    {plan.items.map((item) => <li key={item}><Check size={15} />{item}</li>)}
                  </ul>
                  <Link className="text-link" href={plan.href}>{plan.action} <ArrowUpRight size={15} /></Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="pricing-boundary content-callout content-callout-acid" aria-label="UsageMax pricing boundary">
          <ShieldCheck size={18} />
          <span>There is no hidden content tax. Every plan keeps the same privacy boundary: aggregate usage context is useful; prompts, completions, source code, credentials, and secrets stay out of the public projection.</span>
        </section>

        <section className="content-section pricing-next"><span>Need the detail?</span><TextLink href="/enterprise">Explore enterprise controls</TextLink><TextLink href="/security">Read the security model</TextLink></section>
      </div>
    </div>
  );
}
