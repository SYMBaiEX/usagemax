const markdown = `---
title: Contact UsageMax
description: Contact UsageMax about support, enterprise workspaces, security, privacy, or public profile requests.
canonical: https://usagemax.com/contact
last-updated: 2026-09-16
---

# Contact UsageMax

Email [hello@usagemax.com](mailto:hello@usagemax.com) for product support, enterprise conversations, collector or API questions, accessibility feedback, and public profile requests.

Include the page or endpoint, a timestamp, a request ID if available, and the behavior you expected. Do not include collector tokens, provider credentials, prompts, completions, source code, or private telemetry in an email.

For a team evaluation, include the number of people, connected computers, providers, retention expectations, identity requirements, and private cost-center reporting needs. Enterprise service levels and compliance requirements are verified separately during onboarding.

For a suspected vulnerability, use “Security” in the subject and do not send exploit payloads or secrets. Review the [security overview](https://usagemax.com/security) and [privacy policy](https://usagemax.com/privacy) first.
`;

const headers = { "cache-control": "public, max-age=3600, stale-while-revalidate=86400", "content-type": "text/markdown; charset=utf-8", vary: "Accept" };

export function GET() { return new Response(markdown, { headers }); }
export function HEAD() { return new Response(null, { headers }); }
