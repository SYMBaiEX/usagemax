import { NextRequest } from "next/server";
import { startAuthentication } from "@/lib/auth-start";

// WorkOS Initiate Login URI: retain invitations, SSO discovery and MFA recovery.
export function GET(request: NextRequest) {
  return startAuthentication(request, true);
}
