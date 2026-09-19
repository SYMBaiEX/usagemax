import type { Metadata } from "next";
import Link from "next/link";

import { ArrowUpRight } from "@/components/icons";
import { PageIntro, TextLink } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Sandbox",
  alternates: { canonical: "https://usagemax.com/sandbox" },
  description: "Validate a bounded UsageMax telemetry batch without writing production data.",
};

export default function SandboxPage() {
  return (
    <div className="page-surface content-page">
      <PageIntro title="Test the contract safely.">
        <Link className="button button-acid" href="/docs">Read the docs <ArrowUpRight size={16} /></Link>
      </PageIntro>
      <div className="shell legal-layout">
        <aside className="legal-index">
          <nav aria-label="Sandbox">
            <Link href="/sandbox" aria-current="page">Sandbox</Link>
            <Link href="/docs">Documentation</Link>
            <Link href="/security">Security</Link>
          </nav>
        </aside>
        <article className="legal-article">
          <section className="legal-section">
            <h2>No writes. No credentials.</h2>
            <p>Use the sandbox validator to test an event serializer before connecting a computer. It accepts a small, content-free batch, validates the documented shape, and returns a receipt with <code>writes: false</code>. Nothing is stored, scheduled, or added to a profile.</p>
          </section>
          <section className="legal-section">
            <h2>POST /api/v1/sandbox/validate</h2>
            <p>Send 1–100 events in a JSON body below 16 KiB. The machine-readable <TextLink href="/api/v1/sandbox">descriptor</TextLink> includes the current limits and example. For the production write contract, use the <TextLink href="/openapi.json">OpenAPI schema</TextLink> after linking an installation.</p>
            <pre>{`{
  "events": [{
    "eventKey": "sandbox-example-1",
    "model": "example-model",
    "occurredAt": "2026-09-16T12:00:00Z",
    "eventType": "model_request",
    "totalTokens": 0,
    "costMicros": 0
  }]
}`}</pre>
          </section>
        </article>
      </div>
    </div>
  );
}
