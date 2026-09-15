import Image from "next/image";

/** Raster renditions exported by Apple's Icon Composer; vectors stay available for print. */
export function BrandIcon() {
  return <span className="brand-mark" aria-hidden="true">
    <Image className="art-light" src="/brand/icon-light-64.png" width={32} height={32} alt="" unoptimized />
    <Image className="art-dark" src="/brand/icon-dark-64.png" width={32} height={32} alt="" unoptimized />
  </span>;
}
