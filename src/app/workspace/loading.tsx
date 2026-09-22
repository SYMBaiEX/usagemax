import styles from "@/components/workspace.module.css";

export default function WorkspaceLoading() {
  return (
    <main className={`shell ${styles.workspace}`}>
      <div className={styles.loadingShell} role="status" aria-label="Loading workspace">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
