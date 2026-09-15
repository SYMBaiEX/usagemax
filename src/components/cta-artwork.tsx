import Image from "next/image";

export function CtaArtwork() {
  return <div className="cta-artwork" aria-hidden="true">
    <Image className="art-light" src="/brand/cta-light.webp" width={1200} height={800} sizes="(max-width: 700px) 90vw, 48vw" alt="" loading="lazy" />
    <Image className="art-dark" src="/brand/cta-dark.webp" width={1200} height={800} sizes="(max-width: 700px) 90vw, 55vw" alt="" loading="lazy" />
  </div>;
}
