"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./motion-surface.module.css";

/** Content stays visible without JS. Each section reveals once, not on every scroll. */
export function MotionSurface({ children, parallax = false }: { children: ReactNode; parallax?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      if (!preference.matches) animation = element.animate(
        [{ opacity: .45, transform: "translateY(18px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 650, easing: "cubic-bezier(.22,1,.36,1)" },
      );
    }, { threshold: .08 });
    const reduce = () => { if (preference.matches) animation?.cancel(); };
    observer.observe(element);
    preference.addEventListener("change", reduce);
    return () => { observer.disconnect(); animation?.cancel(); preference.removeEventListener("change", reduce); };
  }, []);
  return <div ref={ref} className={styles.surface}><div className={parallax ? styles.parallax : undefined}>{children}</div></div>;
}
