import type { Metadata } from "next";
import Link from "next/link";

import { PageIntro, TextLink } from "@/components/site-shell";
import { ArrowUpRight, ShieldCheck } from "@/components/icons";

export const metadata: Metadata = {
  title: "Contact UsageMax",
  description: "Contact UsageMax about support, enterprise workspaces, security, privacy, or public profile requests.",
  alternates: { canonical: "https://usagemax.com/contact" },
};

export default function ContactPage() {
  return (
    <div className="page-surface content-page">
      <PageIntro title="Bring us the hard part.">
        <a className="button button-acid" href="mailto:hello@usagemax.com">Email UsageMax <ArrowUpRight size={16} /></a>
      </PageIntro>
      <div className="shell legal-layout">
        <aside className="legal-index">
          <nav aria-label="Contact UsageMax">
            <Link href="/contact" aria-current="page">Contact</Link>
            <Link href="/enterprise">For teams</Link>
            <Link href="/security">Security</Link>
          </nav>
        </aside>
        <article className="legal-article">
          <section className="legal-section">
            <h2>hello@usagemax.com</h2>
            <p>Use this address for product support, enterprise conversations, questions about the collector or API, accessibility feedback, and requests about a public profile. Include the smallest useful amount of context: the page or endpoint, a timestamp, a request ID if one is available, and the behavior you expected. Do not include collector tokens, provider credentials, prompts, completions, source code, or private telemetry in an email.</p>
          </section>
          <section className="legal-section">
            <h2>Enterprise and security</h2>
            <p>For a team evaluation, tell us the number of people, connected computers, providers, retention expectations, identity requirements, and whether you need private cost-center reporting. We can then discuss workspace boundaries, SSO and directory setup, ingestion limits, exports, support, and any residency or compliance requirements that must be verified before a commitment.</p>
            <p>For a suspected vulnerability, use the same address with “Security” in the subject and avoid sending exploit payloads or secrets. Review the <TextLink href="/security">security overview</TextLink> and <TextLink href="/privacy">privacy policy</TextLink> first; they define the current public boundary.</p>
          </section>
          <div className="content-callout content-callout-acid"><ArrowUpRight size={18} /><span><strong>Public by choice.</strong> We can help with profile visibility, deletion, or collector revocation. <TextLink href="/docs">Start with the docs</TextLink>.</span></div>
          <div className="content-callout"><ShieldCheck size={18} /><span>UsageMax does not promise a response time or compliance certification on this public page. Enterprise service levels are documented separately during onboarding.</span></div>
        </article>
      </div>
    </div>
  );
}
