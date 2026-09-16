import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";

const recovery = `# UsageMax page not found

The requested page is unavailable or private.

- Home: https://usagemax.com/
- Documentation: https://usagemax.com/docs
- API catalog: https://usagemax.com/.well-known/api-catalog
- Agent guide: https://usagemax.com/llms.txt`;

export default function NotFound() {
  return <section className="empty-page"><span className="section-index">404</span><h1>Page not found</h1><p>This page is unavailable or private.</p><p>Try <Link className="text-link" href="/">/</Link>, <Link className="text-link" href="/docs">/docs</Link>, or <Link className="text-link" href="/leaderboard">/leaderboard</Link>.</p><div className="inline-links"><Link className="button button-dark" href="/">Back to UsageMax <ArrowUpRight size={16} /></Link><Link className="text-link" href="/leaderboard">Leaderboard <ArrowUpRight size={14} /></Link></div><details className="machine-recovery"><summary>Machine-readable recovery</summary><pre>{recovery}</pre></details></section>;
}
