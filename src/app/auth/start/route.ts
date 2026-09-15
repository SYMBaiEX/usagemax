import { NextRequest } from "next/server";
import { startAuthentication } from "@/lib/auth-start";
export function GET(request: NextRequest) {
  return startAuthentication(request);
}
