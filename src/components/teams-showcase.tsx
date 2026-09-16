"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowUpRight, LockClosed, UsageMark } from "./icons";
import { ProfileAvatar } from "./profile-avatar";
import styles from "./product-stories.module.css";

const views = ["Usage", "Access", "Collectors"] as const;
type View = (typeof views)[number];
const explanations: Record<View, string> = {
  Usage: "Compare aggregate usage across connected computers.",
  Access: "Workspace roles control who can export data and manage collectors.",
  Collectors: "Each installation gets its own revocable, device-bound key.",
};

// Deliberately local fixtures: this illustration never queries customer data.
const people = [
  { name: "Alex", source: "Claude Code", tokens: "4.8M", share: 48, role: "Owner", computer: "Alex’s Mac", status: "Synced", tone: "orange" },
  { name: "Sam", source: "Codex", tokens: "3.7M", share: 37, role: "Admin", computer: "Sam’s workstation", status: "Synced", tone: "green" },
  { name: "Rin", source: "Gemini CLI", tokens: "1.5M", share: 15, role: "Viewer", computer: "Rin’s laptop", status: "Offline", tone: "blue" },
] as const;

export function TeamsShowcase({ variant = "home" }: { variant?: "home" | "page" }) {
  const [view, setView] = useState<View>("Usage");
  const id = useId();
  return (
    <section className={`${styles.teamStage} ${variant === "page" ? styles.fullStage : ""}`} aria-labelledby={`${id}-title`}>
      <div className={styles.teamEditorial}>
        <div className={styles.teamCopy}>
          <span className={styles.kicker}><LockClosed size={12} /> Private workspaces</span>
          <h2 id={`${id}-title`}>{variant === "home" ? "UsageMax for teams" : "Your team, connected."}</h2>
          <p>Shared usage. Individual access.<br />Every connected computer, accounted for.</p>
          {variant === "home" ? <Link className={styles.storyLink} href="/enterprise">Explore team features <ArrowUpRight size={16} /></Link> : <Link className={styles.storyLink} href="/security">Explore the security model <ArrowUpRight size={16} /></Link>}
        </div>
      </div>

      <div className={styles.previewFrame}>
        <div className={styles.previewTop}><span><UsageMark size={18} /> Studio workspace</span><span className={styles.exampleBadge}>Example data</span></div>
        <div className={styles.switcher} role="group" aria-label="Workspace preview">
          {views.map((item) => <button type="button" key={item} aria-pressed={view === item} aria-controls={`${id}-panel`} onClick={() => setView(item)}>{item}</button>)}
        </div>
        <div key={view} className={styles.workspacePanel} id={`${id}-panel`} role="region" aria-label={`${view} example`}>
          {view === "Usage" ? <>
            <div className={styles.previewMetric}><div><span>Tokens · 7 days</span><strong>10.0<span>M</span></strong></div><div className={styles.miniColumns} aria-hidden="true">{[28, 43, 36, 65, 52, 78, 92].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div></div>
            <div className={styles.shareTrack} aria-hidden="true">{people.map((person) => <i key={person.name} data-tone={person.tone} style={{ flex: person.share }} />)}</div>
            <div className={styles.previewRows}>{people.map((person) => <div className={styles.personRow} key={person.name}><ProfileAvatar handle={`example-${person.name}`} /><span><strong>{person.name}</strong><small>{person.source}</small></span><b>{person.tokens}</b><span className={styles.shareLabel}>{person.share}%</span></div>)}</div>
          </> : view === "Access" ? <>
            <div className={styles.panelHeading}><span className={styles.roundIcon}><LockClosed size={22} /></span><div><strong>Access stays intentional.</strong><p>Three people. Three workspace roles.</p></div></div>
            <div className={styles.previewRows}>{people.map((person) => <div className={styles.personRow} key={person.name}><ProfileAvatar handle={`example-${person.name}`} /><span><strong>{person.name}</strong><small>{person.role === "Owner" ? "Full workspace control" : person.role === "Admin" ? "Manage & export · no deletion" : "Read-only access"}</small></span><b className={styles.roleBadge}>{person.role}</b></div>)}</div>
            <p className={styles.panelNote}>Illustrative role defaults. Organization permissions can be customized.</p>
          </> : <>
            <div className={styles.previewMetric}><div><span>Connected installations</span><strong>03</strong></div><span className={styles.keyLabel}><LockClosed size={13} /> Write-only keys</span></div>
            <div className={styles.previewRows}>{people.map((person) => <div className={styles.personRow} key={person.name}><span className={styles.computerIcon} aria-hidden="true"><i /></span><span><strong>{person.computer}</strong><small>{person.source}</small></span><b className={styles.deviceStatus} data-offline={person.status === "Offline"}><i />{person.status}</b></div>)}</div>
            <p className={styles.panelNote}>Offline devices keep their previously synced history.</p>
          </>}
        </div>
        <p className={styles.previewCaption} role="status">{explanations[view]}</p>
      </div>
    </section>
  );
}
