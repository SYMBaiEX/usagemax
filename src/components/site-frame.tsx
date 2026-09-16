"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

export function SiteFrame({ children, header, footer }: { children: ReactNode; header: ReactNode; footer: ReactNode }) {
  const path = usePathname();
  const authPage = path === "/sign-in" || path === "/sign-up";
  const footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = footerRef.current;
    if (!element) return;
    // Only dock when every footer link fits. Tall/zoomed layouts keep native flow.
    const measure = () => {
      element.dataset.dockable = String(element.offsetHeight <= window.innerHeight - 88);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [authPage]);
  return <>{!authPage && header}<main className="site-main" id="main-content">{children}</main>{!authPage && <div className="footer-dock" ref={footerRef}>{footer}</div>}</>;
}
