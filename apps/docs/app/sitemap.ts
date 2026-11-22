import type { MetadataRoute } from "next";

import { docsOrigin, source } from "../lib/source";

export default function sitemap(): MetadataRoute.Sitemap {
  return source.getPages().map((page) => ({ url: new URL(page.url, docsOrigin).href }));
}
