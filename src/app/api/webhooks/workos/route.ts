import { forwardWorkosWebhook } from "@/lib/workos-webhook";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return await forwardWorkosWebhook(request);
}
