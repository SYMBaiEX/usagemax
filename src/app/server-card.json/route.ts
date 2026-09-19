import { GET as canonicalGet, HEAD as canonicalHead } from "@/app/.well-known/mcp/server-card.json/route";

export const dynamic = "force-static";

/** Compatibility alias for clients that discovered the card before its well-known path was standardized. */
export function GET() {
  return canonicalGet();
}

export function HEAD() {
  return canonicalHead();
}
