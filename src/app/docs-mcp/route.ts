import { handlePost } from "@/lib/mcp/http";

export async function POST(request: Request) { return handlePost(request, "docs"); }
export { getMcp as GET } from "@/lib/mcp/http";
