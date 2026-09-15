import { UsageMark } from "./icons";
import styles from "./auth-page.module.css";

// A deterministic, server-rendered surface. No WebGL, canvas, or render loop.
function ribbon(u: number) {
  let depth = 0;
  const points = Array.from({ length: 65 }, (_, index) => {
    const v = index / 64 * Math.PI * 2;
    const radius = 116 + 45 * Math.cos(v);
    const x = radius * Math.cos(u);
    const y = radius * Math.sin(u);
    const z = 45 * Math.sin(v);
    const tiltedY = y * Math.cos(.9) - z * Math.sin(.9);
    const tiltedZ = y * Math.sin(.9) + z * Math.cos(.9);
    const rotatedX = x * Math.cos(-.45) - tiltedY * Math.sin(-.45);
    const rotatedY = x * Math.sin(-.45) + tiltedY * Math.cos(-.45);
    const perspective = 650 / (650 - tiltedZ);
    depth += tiltedZ;
    return `${index === 0 ? "M" : "L"}${(280 + rotatedX * perspective * 1.22).toFixed(2)},${(211 + rotatedY * perspective * 1.22).toFixed(2)}`;
  });
  return { d: `${points.join(" ")}Z`, depth };
}
const ribbons = Array.from({ length: 56 }, (_, index) => ribbon(index / 56 * Math.PI * 2)).sort((a, b) => a.depth - b.depth);

export function AuthSculpture() {
  return <div className={styles.sculpture} aria-hidden="true">
    <div className={styles.sculptureShadow} />
    <svg viewBox="0 0 560 420" fill="none" className={styles.ribbon}>
      <defs>
        <linearGradient id="auth-ribbon" x1="80" y1="100" x2="450" y2="350" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffd6a0" /><stop offset=".28" stopColor="#fb8452" /><stop offset=".57" stopColor="#af341b" /><stop offset=".82" stopColor="#f77742" /><stop offset="1" stopColor="#ffbe7d" />
        </linearGradient>
      </defs>
      {ribbons.map((path, index) => <path key={index} d={path.d} stroke="url(#auth-ribbon)" strokeWidth="2.2" />)}
    </svg>
    <span className={styles.core}><UsageMark size={31} /></span>
    <span className={`${styles.orbitTag} ${styles.tagOne}`}>models</span>
    <span className={`${styles.orbitTag} ${styles.tagTwo}`}>computers</span>
    <span className={`${styles.orbitTag} ${styles.tagThree}`}>you<span>↗</span></span>
  </div>;
}
