import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";

export type VaultConfig = { root: string; id: string };

export async function loadConfig(): Promise<VaultConfig> {
  const path = process.env.OBSIDIAN_VAULT_PATH;
  if (!path || !isAbsolute(path)) {
    throw new Error("Set OBSIDIAN_VAULT_PATH to an existing absolute directory path in .env.");
  }
  try {
    const root = await realpath(path);
    if (!(await stat(root)).isDirectory()) throw new Error("Not a directory");
    const id = process.env.OBSIDIAN_VAULT_ID?.trim() || "personal";
    return { root, id };
  } catch {
    throw new Error("OBSIDIAN_VAULT_PATH must be an accessible directory.");
  }
}
