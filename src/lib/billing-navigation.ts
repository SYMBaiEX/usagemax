import { NextResponse } from "next/server";
import { signInHref } from "./product-navigation";

export const billingWorkspaceHref = "/workspace?tab=billing";
export const billingAccountHref = "/account?billing=manage#account-billing";

export function billingFailure(request: Request, origin: string, code: string, status: number) {
  const flow = new URL(request.url).searchParams.get("flow");
  const destination = flow === "workspace" ? billingWorkspaceHref : flow === "account" ? billingAccountHref : null;
  if (!destination) return NextResponse.json({ error: code }, { status });
  if (status === 401) return NextResponse.redirect(new URL(signInHref(destination), origin), 303);
  const url = new URL(destination, origin);
  url.searchParams.set("billing", code);
  return NextResponse.redirect(url, 303);
}
