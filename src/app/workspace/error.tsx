"use client";

import styles from "@/components/workspace.module.css";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className={`shell ${styles.workspace}`}>
      <section className={styles.panel} role="alert">
        <span className={styles.panelEyebrow}>WORKSPACE</span>
        <h1 className={styles.errorTitle}>Your workspace could not load</h1>
        <p className={styles.hint}>
          The latest workspace data is unavailable. Try again in a moment.
        </p>
        {error.digest && (
          <p className={styles.errorReference}>Reference {error.digest}</p>
        )}
        <button className="button button-primary" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
