/** Explicit operator command. Never called from a public API. */
import { WorkOS } from "@workos-inc/node";
import { ROLE_PERMISSIONS, WORKSPACE_PERMISSIONS } from "../convex/account";

const key = process.env.WORKOS_API_KEY;
if (!key || key === "[SENSITIVE]")
  throw new Error(
    "A real WORKOS_API_KEY is required in the operator environment.",
  );
const sdk = new WorkOS(key);
const apply = process.argv.includes("--apply");
const roles = await sdk.authorization.listEnvironmentRoles();
const permissions = await sdk.authorization.listPermissions({ limit: 100 });
const existingSlugs = new Set(permissions.data.map((p) => p.slug));
for (const slug of WORKSPACE_PERMISSIONS) {
  if (!existingSlugs.has(slug)) {
    if (apply)
      await sdk.authorization.createPermission({
        slug,
        name: `UsageMax ${slug}`,
      });
    console.log(`${apply ? "Created" : "Would create"} permission ${slug}`);
  }
}
for (const [slug, desired] of Object.entries(ROLE_PERMISSIONS)) {
  let role = roles.data.find((r) => r.slug === slug);
  if (!role && apply)
    role = await sdk.authorization.createEnvironmentRole({
      slug,
      name: `UsageMax ${slug}`,
      description: "UsageMax workspace role",
    });
  // Preserve existing unrelated widget permissions. Never silently reduce access here.
  const merged = [
    ...new Set([...(role?.permissions ?? []), ...desired]),
  ].sort();
  if (apply && role && merged.join() !== [...role.permissions].sort().join())
    await sdk.authorization.setEnvironmentRolePermissions(slug, {
      permissions: merged,
    });
  console.log(
    JSON.stringify({
      mode: apply ? "applied" : "dry-run",
      role: slug,
      permissions: merged,
    }),
  );
}
