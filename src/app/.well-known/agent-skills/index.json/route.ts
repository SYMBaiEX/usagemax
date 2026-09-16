const index = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: "usage-observability",
      description: "Read public UsageMax AI-usage projections and explain the content-free collector contract.",
      url: "https://github.com/SYMBaiEX/usagemax/blob/main/skills/usage-observability/SKILL.md",
    },
    {
      name: "enterprise-reporting",
      description: "Use UsageMax contracts and tenant boundaries to design enterprise AI-usage reporting.",
      url: "https://github.com/SYMBaiEX/usagemax/blob/main/skills/enterprise-reporting/SKILL.md",
    },
  ],
};

export function GET() {
  return Response.json(index, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  });
}

export function HEAD() {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
