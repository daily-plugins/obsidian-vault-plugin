import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { setTimeout } from "node:timers/promises";
import type { VaultConfig } from "./config.js";
import { VaultError } from "./vault.js";

const execute = promisify(execFile);
export type CliRunner = (args: string[]) => Promise<string>;
export function createObsidianRunner(config: VaultConfig): CliRunner {
  return async args => {
    try {
      const result = await execute(process.env.OBSIDIAN_CLI_PATH || "obsidian", args, {
        cwd: config.root, timeout: 15_000, maxBuffer: 2_097_152, windowsHide: true,
      });
      if (/^(?:Error:|Unknown command|CLI is not enabled)/imu.test(result.stdout)) throw new Error("CLI error");
      return result.stdout.trim();
    } catch {
      throw new VaultError("Obsidian CLI failed. Use Obsidian 1.12.7+, enable Settings > General > Command line interface, keep the target Vault open, and check OBSIDIAN_CLI_PATH / OBSIDIAN_APP_VAULT.");
    }
  };
}

export async function captureGraphView(config: VaultConfig, run = createObsidianRunner(config), settleMs = 1000) {
  // Only fixed CLI commands are exposed; neither shell strings nor JavaScript are accepted from tool input.
  const selector = `vault=${process.env.OBSIDIAN_APP_VAULT || basename(config.root)}`;
  const reportedRoot = (await run([selector, "vault", "info=path"])).trim();
  let matchingRoot = false;
  try { matchingRoot = await realpath(reportedRoot) === config.root; } catch { /* Fail closed on unexpected CLI output. */ }
  if (!matchingRoot) throw new VaultError("Obsidian selected a different Vault. Set OBSIDIAN_APP_VAULT to the correct Vault name or ID.");
  const commands = (await run([selector, "commands", "filter=graph"])).split(/\r?\n/u).map(line => line.trim());
  if (!commands.includes("graph:open")) throw new VaultError("Enable Obsidian's Graph view core plugin before capturing its view.");
  await run([selector, "command", "id=graph:open"]);
  await setTimeout(settleMs);
  const temp = await mkdtemp(join(tmpdir(), "obsidian-graph-"));
  try {
    const output = join(temp, "graph.png");
    await run([selector, "dev:screenshot", `path=${output}`]);
    if ((await stat(output)).size > 10_485_760) throw new VaultError("Graph screenshot exceeds the 10 MiB limit.");
    const png = await readFile(output);
    if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new VaultError("Obsidian did not return a valid PNG screenshot.");
    }
    return {data: png.toString("base64"), mimeType: "image/png" as const,
      description: "Actual Obsidian app screenshot after opening Graph view. Existing graph filters/theme are preserved. The image may include sidebars or other visible panes; this is a static snapshot, not an interactive graph. Filesystem exclusions do not filter this image."};
  } finally { await rm(temp, {recursive: true, force: true}); }
}
