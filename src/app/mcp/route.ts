import { getMcp, handlePost } from "@/lib/mcp/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handlePost(request, "public");
}

export function GET() {
  return getMcp();
}
