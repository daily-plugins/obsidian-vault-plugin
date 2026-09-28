import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { validateRelativePath } from "./vault.js";

export type VaultConfig = { root: string; id: string; excludedPaths: string[] };

export async function loadConfig(): Promise<VaultConfig> {
  const path = process.env.OBSIDIAN_VAULT_PATH;
  if (!path || !isAbsolute(path)) {
    throw new Error("Set OBSIDIAN_VAULT_PATH to an existing absolute directory path in .env.");
  }
  let excludedPaths: string[];
  try {
    const parsed: unknown = JSON.parse(process.env.OBSIDIAN_EXCLUDED_PATHS || "[]");
    if (!Array.isArray(parsed) || !parsed.every((value): value is string => typeof value === "string")) throw new Error();
    excludedPaths = parsed.map(path => validateRelativePath(path));
  } catch {
    throw new Error("OBSIDIAN_EXCLUDED_PATHS must be a JSON array of visible Vault-relative paths.");
  }
  try {
    const root = await realpath(path);
    if (!(await stat(root)).isDirectory()) throw new Error("Not a directory");
    const id = process.env.OBSIDIAN_VAULT_ID?.trim() || "personal";
    return { root, id, excludedPaths };
  } catch {
    throw new Error("OBSIDIAN_VAULT_PATH must be an accessible directory.");
  }
}
