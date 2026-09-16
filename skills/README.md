# UsageMax agent skills

This directory contains three direct-installable `SKILL.md` files:

- `usage-observability`: read public UsageMax projections and explain the
  content-free collector boundary.
- `enterprise-reporting`: design tenant-safe UsageMax reporting from the
  documented public contracts.
- `collector-diagnostics`: diagnose collector credentials and device bindings
  with redacted, read-only status checks.

Install a selected skill from the public default branch with the `skills` CLI:

```bash
npx skills add SYMBaiEX/usagemax --skill usage-observability
npx skills add SYMBaiEX/usagemax --skill enterprise-reporting
npx skills add SYMBaiEX/usagemax --skill collector-diagnostics
```

The public source repository and the deployed
[`/.well-known/agent-skills/index.json`](https://usagemax.com/.well-known/agent-skills/index.json)
are the current source and digest inventory. A local `SKILL.md` does not by
itself prove that skills.sh has indexed the skill, recorded an install, or
completed a security audit.
