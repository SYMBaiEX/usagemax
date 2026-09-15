import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UsageMax",
    short_name: "UsageMax",
    description: "Your AI work, on the record. Private by default. Public by choice.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f0e",
    theme_color: "#0b0f0e",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-light.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
