"use client";

import { useEffect, useRef } from "react";
import styles from "./code-field.module.css";

const lines = [
  "const record = await usage.sync({ private: true });",
  "  retained.history → normalize → deduplicate",
  "  model · input · output · cache · reasoning",
  "  001101   ::   measure(work)   ::   110010",
  "export { tokens, sessions, sources, costBasis };",
  "  └─ local.files   └─ snapshots   └─ your.account",
  "  privacy.default = true;   payload.prompts = false;",
  "  ░░▒▒▓▓   [ source → record → perspective ]",
  "await client.mutation(usage.snapshot, aggregate);",
  "  one.machine + another.machine → one.record",
  "  { estimates: explicit, missing: null }",
  "  100101   ::   build(something)   ::   011010",
];

/** Decorative source-code texture, never presented as actual event telemetry. */
export function CodeField({ variant = "default" }: { variant?: "default" | "footer" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let visible = false;
    const sync = () => { element.dataset.running = String(visible && !document.hidden); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(element);
    document.addEventListener("visibilitychange", sync);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", sync); };
  }, []);
  return <div ref={ref} className={`${styles.field} ${variant === "footer" ? styles.footer : ""}`} aria-hidden="true" data-running="false"><div className={styles.tape}>{[0, 1].map(copy => <pre key={copy}>{lines.map((line, index) => <span key={index}>{line}{"    "}{line}</span>)}</pre>)}</div></div>;
}
