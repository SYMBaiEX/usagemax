"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function SiteFrame({ children, header, footer }: { children: ReactNode; header: ReactNode; footer: ReactNode }) {
  const path = usePathname();
  const authPage = path === "/sign-in" || path === "/sign-up";
  return <>{!authPage && header}<main className="site-main" id="main-content">{children}</main>{!authPage && footer}</>;
}
