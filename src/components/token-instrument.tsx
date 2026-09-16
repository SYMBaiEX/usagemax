"use client";

import { useState } from "react";
import { compactNumber, currencyFromMicros } from "@/lib/format";
import { UsageMark } from "./icons";
import styles from "./token-instrument.module.css";

type InstrumentTotals = { totalTokens: number; totalSessions: number; totalCostMicros: number };
const modes = ["Tokens", "Sessions", "Cost¹"] as const;

/** A data-driven physical counter. No polling, animation loop, or invented activity. */
export function TokenInstrument({ totals }: { totals?: InstrumentTotals }) {
  const [mode, setMode] = useState(0);
  const value = !totals ? "—" : mode === 0 ? compactNumber(totals.totalTokens, 2) : mode === 1 ? compactNumber(totals.totalSessions, 2) : currencyFromMicros(totals.totalCostMicros);
  const display = mode === 2 && totals ? `$${compactNumber(totals.totalCostMicros / 1_000_000, 2)}` : value;
  return (
    <div className={styles.scene}>
      <div className={styles.floor} aria-hidden="true" />
      <figure className={styles.machine} aria-label="Interactive UsageMax network counter">
        <div className={styles.top}><span><UsageMark size={20} /> USAGEMAX</span></div>
        <div className={styles.face}>
          <div className={styles.caption}><span>{mode === 2 ? "TRACKED COST · USD" : `${modes[mode].toUpperCase()} COUNTED`}</span><span>ALL TIME</span></div>
          <div className={styles.digits} aria-label={`${modes[mode]}: ${value}`} aria-live="polite" aria-atomic="true">
            {Array.from(display).map((digit, index) => <span key={index} className={digit === "." || digit === "," ? styles.punctuation : undefined} aria-hidden="true"><b key={digit}>{digit}</b></span>)}
          </div>
          <div className={styles.faceFoot}><span>YOUR USAGE, IN PERSPECTIVE.</span><span className={styles.signal} data-ready={Boolean(totals)} /> </div>
        </div>
        <div className={styles.controls}>
          <div className={styles.modeGroup} role="group" aria-label="Network counter metric">
            {modes.map((label, index) => <button type="button" key={label} aria-pressed={mode === index} onClick={() => setMode(index)}><i aria-hidden="true" />{label}</button>)}
          </div>
          <span className={styles.dial} aria-hidden="true"><i /></span>
        </div>
      </figure>
    </div>
  );
}
