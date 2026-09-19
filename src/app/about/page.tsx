import type { Metadata } from "next";
import Link from "next/link";

import { PageIntro, TextLink } from "@/components/site-shell";
import { ArrowRight, ArrowUpRight, ShieldCheck } from "@/components/icons";

export const metadata: Metadata = {
  title: "About UsageMax",
  description: "UsageMax makes AI work measurable across models, agents, and computers without collecting prompt content.",
  alternates: { canonical: "https://usagemax.com/about" },
};

export default function AboutPage() {
  return (
    <div className="page-surface content-page">
      <PageIntro title="A clearer record of AI work.">
        <Link className="button button-acid" href="/docs">Read the docs <ArrowRight size={16} /></Link>
        <Link className="button button-outline" href="/contact">Contact UsageMax <ArrowUpRight size={16} /></Link>
      </PageIntro>
      <div className="shell legal-layout">
        <aside className="legal-index">
          <nav aria-label="About UsageMax">
            <Link href="/about" aria-current="page">About</Link>
            <Link href="/security">Security</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </aside>
        <article className="legal-article">
          <section className="legal-section">
            <h2>What we make</h2>
            <p>UsageMax is an open-source usage observability platform for people and teams building with AI. It brings together local coding-agent histories, native model events, OpenTelemetry traces, provider context, and enterprise workspace reporting into a bounded view of usage. The public side makes aggregate work comparable; the private side gives a workspace owner the controls needed to understand cost, cadence, models, projects, and connected computers.</p>
            <p>Our design principle is simple: make the useful signal portable without turning a usage report into a content archive. Counts, model names, status, timing, and carefully selected attribution fields can explain how a system is being used. Prompts, completions, source code, credentials, and private workspace data do not belong in the public projection.</p>
          </section>
          <section className="legal-section">
            <h2>How the system is split</h2>
            <p>The UsageMax website and API are separate from the optional screen/HUD project. A local collector performs a short-lived, one-shot reconciliation and sends idempotent aggregates or content-free telemetry over HTTPS. Convex provides the realtime projection layer. WorkOS AuthKit handles website sign-in and organization membership; it is not presented as a general API OAuth token.</p>
            <p>UsageMax is built to start small and remain useful at enterprise scale: public reads are bounded, collector credentials are installation-bound and write-only, private workspaces are tenant-scoped, and sensitive actions are designed to be auditable. Capacity, retention, residency, and support commitments for enterprise customers are agreed explicitly rather than implied by the public product.</p>
          </section>
          <div className="content-callout content-callout-acid"><ShieldCheck size={18} /><span>Read the <TextLink href="/security">security model</TextLink> and <TextLink href="/methodology">counting rules</TextLink> before connecting a source.</span></div>
        </article>
      </div>
    </div>
  );
}
