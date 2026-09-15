"use client";

import { useId, useState } from "react";
import { accountingExamples, type AccountingExample } from "@/lib/accounting-examples";
import { ArrowRight, CodeBrackets, ShieldCheck } from "./icons";
import styles from "./product-stories.module.css";

const modes: AccountingExample[] = ["complete", "partial", "replay"];
const format = (value: number) => value.toLocaleString("en-US");

export function CountingWorkbench() {
  const [mode, setMode] = useState<AccountingExample>("complete");
  const example = accountingExamples[mode];
  const id = useId();
  return (
    <section className={styles.workbench} aria-labelledby={`${id}-title`}>
      <div className={styles.workbenchHeading}><div><span className={styles.kicker}>Interactive example</span><h2 id={`${id}-title`}>Follow the tokens.</h2></div><div className={styles.switcher} role="group" aria-label="Accounting example">{modes.map((key) => <button type="button" key={key} aria-pressed={mode === key} aria-controls={`${id}-result`} onClick={() => setMode(key)}>{accountingExamples[key].label}</button>)}</div></div>
      <div className={styles.accountingFlow}>
        <div className={styles.eventReceipt}>
          <div className={styles.receiptHeading}><CodeBrackets size={16} /><span>Source event</span><small>Illustrative payload</small></div>
          <pre aria-label={`${example.label} event payload`} tabIndex={0}><code>{"{\n"}{Object.entries(example.payload).map(([key, value], index, entries) => <span key={key}>{"  "}<span className={styles.codeKey}>{JSON.stringify(key)}</span>{": "}<span className={typeof value === "number" ? styles.codeNumber : styles.codeString}>{JSON.stringify(value)}</span>{index < entries.length - 1 ? "," : ""}{"\n"}</span>)}{"}"}</code></pre>
          <div className={styles.receiptFoot}><span>Cost basis</span><b>Unknown</b><span>No price supplied</span></div>
        </div>
        <span className={styles.flowConnector} aria-hidden="true"><ArrowRight size={20} /></span>
        <div className={styles.countedResult} id={`${id}-result`} role="region" aria-label={`${example.label} accounting result`}>
          <div className={styles.resultTop}><span>Added to your usage</span><span className={styles.resultState} data-replay={mode === "replay"}><ShieldCheck size={13} />{example.state}</span></div>
          <div className={styles.resultNumber}><strong>{format(example.added)}</strong><span>tokens</span></div>
          <div className={styles.accountingTrack} aria-hidden="true" data-replay={mode === "replay"}>
            <i data-tone="orange" style={{ width: `${example.input / example.total * 100}%` }} />
            <i data-tone="green" style={{ width: `${example.output / example.total * 100}%` }} />
            <i data-tone="blue" style={{ width: `${example.unclassified / example.total * 100}%` }} />
          </div>
          <div className={styles.tokenLegend}><span><i data-tone="orange" />Input <b>{format(example.input)}</b></span>{example.output > 0 && <span><i data-tone="green" />Output <b>{format(example.output)}</b></span>}{example.unclassified > 0 && <span><i data-tone="blue" />Unclassified <b>{format(example.unclassified)}</b></span>}</div>
          <p className={styles.formula}>{example.formula}</p>
        </div>
      </div>
      <p className={styles.exampleExplanation} role="status">{example.explanation}</p>
    </section>
  );
}
