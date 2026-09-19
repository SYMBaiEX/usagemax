import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRight, ArrowUpRight } from "@/components/icons";
import { PageIntro, TextLink } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "WebMCP",
  alternates: { canonical: "https://usagemax.com/webmcp" },
  description: "Expose bounded, read-only UsageMax tools to browser-based AI agents.",
};

const registration = `const controller = new AbortController();

await document.modelContext.registerTool({
  name: "usagemax_network_stats",
  title: "Read network statistics",
  description: "Read bounded public UsageMax network statistics.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: true,
    consequentialHint: false
  },
  execute: async (_input, { signal }) => {
    const response = await fetch("https://usagemax.com/api/stats", { credentials: "omit", signal });
    return response.json();
  }
}, { signal: controller.signal });`;

export default function WebMcpPage() {
  return (
    <div className="page-surface content-page docs-page">
      <PageIntro title="WebMCP for UsageMax">
        <Link className="button button-acid" href="/docs">Read the docs <ArrowRight size={16} /></Link>
        <Link className="button button-outline" href="/webmcp.md">Machine-readable guide <ArrowUpRight size={16} /></Link>
      </PageIntro>
      <div className="shell docs-layout">
        <aside className="docs-index">
          <div className="docs-index-label">On this page</div>
          <a href="#surface">01 / Tool surface</a>
          <a href="#registration">02 / Registration</a>
          <a href="#boundary">03 / Boundary</a>
          <div className="docs-index-card"><ArrowUpRight size={18} /><TextLink href="https://webmachinelearning.github.io/webmcp/">WebMCP draft</TextLink></div>
        </aside>
        <article className="docs-article">
          <section className="docs-section" id="surface">
            <h2>Tools in the page</h2>
            <p>When supported, UsageMax registers four bounded read-only tools directly on <code>document.modelContext</code>. Agents can read public network totals, the leaderboard, an opt-in profile, or cited public documentation without an API credential.</p>
            <div className="endpoint-list">
              <div><span className="endpoint-method">READ</span><code>usagemax_network_stats</code><small>bounded public network totals</small></div>
              <div><span className="endpoint-method">READ</span><code>usagemax_leaderboard</code><small>bounded public ranking</small></div>
              <div><span className="endpoint-method">READ</span><code>usagemax_public_profile</code><small>one opt-in profile by handle</small></div>
              <div><span className="endpoint-method">READ</span><code>usagemax_ask</code><small>cited public documentation answers</small></div>
            </div>
          </section>
          <section className="docs-section" id="registration">
            <h2>Imperative registration</h2>
            <p>The current standards path is <code>document.modelContext.registerTool()</code>. Each registration receives the same <code>AbortSignal</code>; aborting it unregisters the tools when the owning page is disposed.</p>
            <pre tabIndex={0} aria-label="WebMCP registration example"><code>{registration}</code></pre>
          </section>
          <section className="docs-section" id="boundary">
            <h2>Read-only by construction</h2>
            <p>Tool schemas are closed and bounded. Outputs are public projections, marked as untrusted content, and never include prompts, completions, credentials, source code, or private workspace data. If WebMCP is unavailable or blocked by permissions policy, the normal UsageMax page remains unchanged.</p>
            <div className="inline-links"><TextLink href="/security">Security</TextLink><TextLink href="/privacy">Privacy</TextLink><TextLink href="/">UsageMax home</TextLink></div>
          </section>
        </article>
      </div>
    </div>
  );
}
