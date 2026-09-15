"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="empty-page"><span className="section-index">Connection interrupted</span><h1>Let’s try that<br />one more time.</h1><p>We couldn’t load this view. Try again, or return to the homepage.</p><div className="inline-links"><button className="button button-dark" onClick={reset} type="button">Try again</button><Link className="text-link" href="/">Back to UsageMax</Link></div></section>;
}
