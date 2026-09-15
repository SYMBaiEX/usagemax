import Link from "next/link";
import { ArrowUpRight } from "@/components/icons";

export default function NotFound() {
  return <section className="empty-page"><span className="section-index">404 / Off the record</span><h1>Nothing on<br />this page. Yet.</h1><p>The address may have changed, or this record is not public. The rest of UsageMax is right here.</p><div className="inline-links"><Link className="button button-dark" href="/">Back to UsageMax <ArrowUpRight size={16} /></Link><Link className="text-link" href="/leaderboard">Explore the ledger <ArrowUpRight size={14} /></Link></div></section>;
}
