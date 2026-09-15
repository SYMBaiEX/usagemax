"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="empty-page"><h1>Unable to load this page</h1><p>Try again or return home.</p><div className="inline-links"><button className="button button-dark" onClick={reset} type="button">Try again</button><Link className="text-link" href="/">Back to UsageMax</Link></div></section>;
}
