import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { platform } from "node:os";
import { join } from "node:path";

const INSTALLATION_FILE = "installation.json";

export function validInstallationId(value) {
  return typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
}

export async function stableInstallationId(directory, preferred) {
  const path = join(directory, INSTALLATION_FILE);
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (validInstallationId(parsed?.id)) return parsed.id;
    throw new Error(`UsageMax installation identity is invalid: ${path}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const id = validInstallationId(preferred) ? preferred : randomUUID();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(path, `${JSON.stringify({ version: 1, id }, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    if (platform() !== "win32") await chmod(path, 0o600);
    return id;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (validInstallationId(parsed?.id)) return parsed.id;
    throw new Error(`UsageMax installation identity is invalid: ${path}`);
  }
}
