import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { ccusageHome, discoverProviderArchives } from "./sources.js";

const executeFile = promisify(execFile);
const MAX_ARCHIVE_LIST_BYTES = 100 * 1024 * 1024;

function archiveFlags(filePath, mode) {
  const compressed = /(?:\.tar\.gz|\.tgz)$/i.test(filePath);
  return mode === "list" ? (compressed ? "-tzf" : "-tf") : (compressed ? "-xzf" : "-xf");
}

export function safeArchiveMember(value, source = "claude") {
  const normalized = String(value || "").replaceAll("\\", "/");
  const parts = normalized.split("/").filter((item) => item && item !== ".");
  const providerDirectory = source === "codex"
    ? parts.includes("sessions") || parts.includes("archived_sessions")
    : parts.includes("projects");
  return !normalized.startsWith("/") && !parts.includes("..") && providerDirectory && normalized.endsWith(".jsonl");
}

async function findProviderRoots(root, maxDirectories = 10_000) {
  const claude = [];
  const codex = [];
  const stack = [root];
  let visited = 0;
  while (stack.length && visited < maxDirectories) {
    const current = stack.pop();
    visited += 1;
    let children;
    try {
      children = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      const childPath = join(current, child.name);
      if (child.name === "projects") claude.push(childPath);
      else if (child.name === "sessions" || child.name === "archived_sessions") codex.push(current);
      else stack.push(childPath);
    }
  }
  return { claude, codex };
}

export async function prepareArchiveRecovery(baseEnv) {
  const detected = await discoverProviderArchives({ env: baseEnv, home: ccusageHome(baseEnv) });
  const archives = detected.filter((item) => /(?:\.tar(?:\.gz)?|\.tgz)$/i.test(item.path));
  const unsupported = detected.length - archives.length;
  if (!archives.length) return { archives: 0, cleanup: async () => undefined, env: baseEnv, unsupported };

  const temporary = await mkdtemp(join(tmpdir(), "usagemax-recover-"));
  try {
    for (let index = 0; index < archives.length; index += 1) {
      const archive = archives[index];
      const destination = join(temporary, `archive-${index + 1}`);
      await mkdir(destination, { recursive: true, mode: 0o700 });
      const { stdout } = await executeFile("tar", [archiveFlags(archive.path, "list"), archive.path], { encoding: "utf8", maxBuffer: MAX_ARCHIVE_LIST_BYTES });
      const members = stdout.split(/\r?\n/).filter((member) => safeArchiveMember(member, archive.source));
      for (let offset = 0; offset < members.length; offset += 80) {
        await executeFile("tar", [archiveFlags(archive.path, "extract"), archive.path, "-C", destination, "--", ...members.slice(offset, offset + 80)], { maxBuffer: 4 * 1024 * 1024 });
      }
    }
    const roots = await findProviderRoots(temporary);
    const existingClaude = String(baseEnv.CLAUDE_CONFIG_DIR || "").split(",").map((item) => item.trim()).filter(Boolean);
    const existingCodex = String(baseEnv.CODEX_HOME || "").split(",").map((item) => item.trim()).filter(Boolean);
    return {
      archives: archives.length,
      cleanup: async () => rm(temporary, { force: true, recursive: true }),
      env: {
        ...baseEnv,
        CLAUDE_CONFIG_DIR: [...new Set([...existingClaude, ...roots.claude])].join(","),
        CODEX_HOME: [...new Set([...existingCodex, ...roots.codex])].join(","),
      },
      unsupported,
    };
  } catch (error) {
    await rm(temporary, { force: true, recursive: true });
    throw error;
  }
}
