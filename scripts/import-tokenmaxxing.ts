import { spawnSync } from "node:child_process";

const production = process.argv.includes("--prod");
const deploymentArgs = production ? ["--prod"] : ["--env-file", ".env.local"];

function convexSecret(name: string) {
  const local = process.env[name];
  if (local) return local;
  const result = spawnSync("bunx", ["convex", "env", "get", name, ...deploymentArgs], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`Unable to read ${name} from the Convex ${production ? "production" : "development"} environment.`);
  return result.stdout.trim();
}

const handle = (process.argv.slice(2).find((argument) => !argument.startsWith("--")) ?? "symbaiex").toLowerCase();
const secret = convexSecret("USAGEMAX_IMPORT_SECRET");
const collectorToken = convexSecret("USAGEMAX_OWNER_COLLECTOR_TOKEN");
const payload = JSON.stringify({ secret, handle, collectorToken });
const result = spawnSync("bunx", ["convex", "run", "imports:importTokenMaxxing", payload, ...deploymentArgs], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
