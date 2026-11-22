import type { MetadataRoute } from "next";

import { docsOrigin } from "../lib/source";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: `${docsOrigin}/sitemap.xml` };
}
