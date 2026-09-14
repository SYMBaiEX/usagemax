import { spawnSync } from "node:child_process";

function convexSecret(name: string) {
  const local = process.env[name];
  if (local) return local;
  const result = spawnSync("bunx", ["convex", "env", "get", name, "--env-file", ".env.local"], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`Unable to read ${name} from the Convex development environment.`);
  return result.stdout.trim();
}

const handle = (process.argv[2] ?? "symbaiex").toLowerCase();
const secret = convexSecret("USAGEMAX_IMPORT_SECRET");
const collectorToken = convexSecret("USAGEMAX_OWNER_COLLECTOR_TOKEN");
const payload = JSON.stringify({ secret, handle, collectorToken });
const result = spawnSync("bunx", ["convex", "run", "imports:importTokenMaxxing", payload, "--env-file", ".env.local"], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
