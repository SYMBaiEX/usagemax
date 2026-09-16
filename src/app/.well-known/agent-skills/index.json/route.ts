const index = {
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: "usage-observability",
      description: "Read public UsageMax AI-usage projections and explain the content-free collector contract.",
      type: "skill-md",
      url: "https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/skills/usage-observability/SKILL.md",
      digest: "sha256:b7233a262032740d3819ab617388d3340acadfb4b2adf124c91c987b76faf6ad",
    },
    {
      name: "enterprise-reporting",
      description: "Use UsageMax contracts and tenant boundaries to design enterprise AI-usage reporting.",
      type: "skill-md",
      url: "https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/skills/enterprise-reporting/SKILL.md",
      digest: "sha256:5a46e259f844dc0cde6e28d3551d67c70842dfed26499e32d1e51131b0e50341",
    },
    {
      name: "collector-diagnostics",
      description: "Diagnose UsageMax collector credentials and device bindings with safe, read-only status checks.",
      type: "skill-md",
      url: "https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/skills/collector-diagnostics/SKILL.md",
      digest: "sha256:a4c2b1807aac56efb9885fd8f9ee2e8533f41e4042c6e580e0257bdec33f068d",
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
