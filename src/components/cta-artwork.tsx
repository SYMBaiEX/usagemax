import Image from "next/image";

export function CtaArtwork({ aboveFold = false }: { aboveFold?: boolean }) {
  // The page-level team artwork is above the fold in either theme. Load both
  // small theme variants promptly so toggling themes never reveals a blank
  // frame; below-fold showcase artwork remains natively lazy.
  return <div className="cta-artwork" aria-hidden="true">
    <Image className="art-light" src="/brand/cta-light.webp" width={1200} height={800} sizes="(max-width: 700px) 90vw, 48vw" alt="" loading={aboveFold ? "eager" : "lazy"} fetchPriority={aboveFold ? "high" : undefined} />
    <Image className="art-dark" src="/brand/cta-dark.webp" width={1200} height={800} sizes="(max-width: 700px) 90vw, 55vw" alt="" loading={aboveFold ? "eager" : "lazy"} fetchPriority={aboveFold ? "high" : undefined} />
  </div>;
}
