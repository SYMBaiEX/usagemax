import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight, ArrowUpRight } from "@/components/icons";
import { PageIntro } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Integrations | UsageMax",
  description: "Connect UsageMax to AI agents, developer tools, local collectors, and observability systems.",
};

const integrations = [
  ["HTTP API", "Read public aggregates and send content-free telemetry through the versioned OpenAPI contract.", "/openapi.json"],
  ["MCP", "Give compatible assistants bounded, read-only access to profiles, rankings, network totals, and site answers.", "/mcp"],
  ["WebMCP", "Let browser agents discover the same public tools directly from the UsageMax website.", "/webmcp"],
  ["Local collector", "Reconcile supported provider histories from each computer with one short-lived, idempotent sync.", "/cli.md"],
  ["OpenTelemetry", "Forward content-free spans and model activity to the traces endpoint without shipping prompts or completions.", "/docs"],
  ["A2A", "Expose a small JSON-RPC surface for agents that need a machine-readable UsageMax capability.", "/a2a"],
] as const;

export default function IntegrationsPage() {
  return (
    <div className="page-surface content-page">
      <PageIntro title="Connect the systems that do the work.">
        <Link className="button button-acid" href="/docs">Read the docs <ArrowRight size={16} /></Link>
        <Link className="button button-outline" href="/openapi.json">View OpenAPI <ArrowUpRight size={16} /></Link>
      </PageIntro>
      <main className="shell legal-article" style={{ maxWidth: "var(--shell-wide, 1120px)" }}>
        <p className="eyebrow">UsageMax integrations</p>
        <h2>One bounded record. Every surface.</h2>
        <p className="lede">UsageMax is designed to fit around the tools your people and agents already use. Choose a read-only discovery surface, connect a local collector, or send content-free telemetry from an existing observability pipeline.</p>
        <div className="detail-grid" style={{ marginTop: "2.5rem" }}>
          {integrations.map(([name, description, href]) => (
            <Link className="detail-card" href={href} key={name}>
              <span className="eyebrow">{name}</span>
              <div className="detail-card-copy"><p>{description}</p><span className="text-link">Explore <ArrowUpRight size={14} /></span></div>
            </Link>
          ))}
        </div>
        <section className="content-callout content-callout-acid" style={{ marginTop: "2.5rem" }}>
          <div><strong>Private by boundary.</strong><br />Prompts, completions, credentials, and private workspace data are never part of the public projection. Start with the no-write <Link href="/sandbox">sandbox</Link>, then read the <Link href="/security">security model</Link>.</div>
        </section>
      </main>
    </div>
  );
}
