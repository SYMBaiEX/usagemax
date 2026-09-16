import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../packages/cli/package.json", import.meta.url), "utf8"));
const response = await fetch("https://usagemax.com/api/health", { signal: AbortSignal.timeout(15_000), redirect: "error", cache: "no-store" });
if (!response.ok) throw new Error("Production health check failed; do not publish CLI.");
const health = await response.json();
if (!health.ok || health.collector?.snapshotChunks !== true || health.collector?.maxChunkRows !== 100 || health.collector?.recommendedCliVersion !== pkg.version) {
  throw new Error("Deploy and verify the matching backend before publishing this CLI version.");
}
console.log(`Production backend supports UsageMax ${pkg.version}.`);
