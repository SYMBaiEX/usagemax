import { readFile, writeFile } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";
import { gatewayBearer, gatewayPaths, gatewaySchemas } from "../src/lib/gateway-openapi";

const schema = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "UsageMax Gateway API", version: "1.0.0" },
  paths: gatewayPaths,
  components: { securitySchemes: { gatewayBearer }, schemas: gatewaySchemas },
});
const output = new URL("../packages/gateway-client/src/schema.ts", import.meta.url);
const types = "// Generated from the UsageMax OpenAPI gateway contract. Run bun run gateway:generate.\n" +
  astToString(await openapiTS(schema));
if (process.argv.includes("--check")) {
  if (await readFile(output, "utf8") !== types) throw new Error("Gateway types are stale. Run bun run gateway:generate.");
} else {
  await writeFile(output, types);
}
