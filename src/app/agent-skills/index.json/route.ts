import { GET as canonicalGet, HEAD as canonicalHead } from "@/app/.well-known/agent-skills/index.json/route";

export const dynamic = "force-static";

/** Compatibility alias for clients that discovered the skills index before its well-known path was standardized. */
export function GET() {
  return canonicalGet();
}

export function HEAD() {
  return canonicalHead();
}
