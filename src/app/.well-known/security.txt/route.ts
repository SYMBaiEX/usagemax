export const dynamic = "force-dynamic";

export function GET() {
  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  return new Response([
    "Contact: mailto:hello@usagemax.com",
    "Canonical: https://usagemax.com/.well-known/security.txt",
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    "Policy: https://usagemax.com/security",
    "",
  ].join("\n"), {
    headers: {
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
