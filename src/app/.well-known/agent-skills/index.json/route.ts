const index = {
  version: "0.2.0",
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: "usage-observability",
      description: "Read public UsageMax AI-usage projections and explain the content-free collector contract.",
      type: "skill-md",
      url: "https://raw.githubusercontent.com/SYMBaiEX/usagemax/main/skills/usage-observability/SKILL.md",
      digest: "sha256:f9f2a5255afe3f93e484c8f3f1669d1a5c54901f22120433799a400530145da1",
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
      digest: "sha256:a4665cbe5fe583d7b903b1f7450edf6cd8524798e37fed7730aa3f51db05b26d",
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
