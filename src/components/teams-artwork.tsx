import { CtaArtwork } from "./cta-artwork";
import styles from "./teams-artwork.module.css";

/** A decorative alcove; all workspace information lives in the adjacent preview. */
export function TeamsArtwork({ aboveFold = false }: { aboveFold?: boolean }) {
  return (
    <div className={styles.composition} aria-hidden="true">
      <span className={styles.orbit} />
      <span className={styles.backplate} />
      <div className={styles.aperture}>
        <CtaArtwork aboveFold={aboveFold} />
      </div>
      <span className={styles.plinth} />
    </div>
  );
}
