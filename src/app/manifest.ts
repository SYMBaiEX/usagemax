import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UsageMax",
    short_name: "UsageMax",
    description: "Public telemetry for the people building with AI.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f0e",
    theme_color: "#0b0f0e",
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
